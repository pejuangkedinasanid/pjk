// FILE: app/api/payment/webhook/route.ts
// POST /api/payment/webhook
//
// Dipanggil OTOMATIS oleh Midtrans (server-to-server notification).
// Daftarkan URL ini di Midtrans Dashboard -> Settings -> Configuration
// -> Payment Notification URL.
//
// PERBAIKAN (revisi ini):
// 1. BUG LAMA: setelah sukses, kode lama menulis ke kolom
//    "status_akun" -- padahal kolom yang BENAR dipakai di seluruh
//    sistem (kuota/cek, kuota/pakai) adalah "plan". Akibatnya, status
//    premium tidak pernah benar-benar ke-set lewat jalur ini. Sudah
//    diganti jadi "plan".
// 2. Sekarang menangani transaksi tipe 'modul' juga, bukan cuma
//    'kuota' -- begitu sukses, modul_unduhan baris terkait di-set
//    status='lunas' (insert kalau belum ada, update kalau sudah ada
//    dari percobaan 'beli' sebelumnya).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = body;

    // 1. Verifikasi signature dari Midtrans
    const expectedSignature = crypto
      .createHash("sha512")
      .update(order_id + status_code + gross_amount + process.env.MIDTRANS_SERVER_KEY)
      .digest("hex");

    if (expectedSignature !== signature_key) {
      return NextResponse.json(
        { success: false, message: "Signature tidak valid." },
        { status: 401 }
      );
    }

    // 2. Ambil data transaksi dari DB
    const { data: trx, error: errTrx } = await supabase
      .from("transaksi")
      .select("*")
      .eq("order_id", order_id)
      .single();

    if (errTrx || !trx) {
      return NextResponse.json({ success: true, message: "Order tidak ditemukan, diabaikan." });
    }

    // 3. Tentukan status final
    let statusBaru = trx.status;

    if (
      (transaction_status === "capture" && fraud_status === "accept") ||
      transaction_status === "settlement"
    ) {
      statusBaru = "success";
    } else if (["cancel", "deny", "expire"].includes(transaction_status)) {
      statusBaru = "failed";
    } else if (transaction_status === "pending") {
      statusBaru = "pending";
    }

    // 4. Cegah proses ganda (idempotent)
    if (trx.status === "success") {
      return NextResponse.json({ success: true, message: "Sudah diproses sebelumnya." });
    }

    // 5. Update tabel transaksi
    await supabase
      .from("transaksi")
      .update({
        status: statusBaru,
        midtrans_response: body,
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", order_id);

    if (statusBaru !== "success") {
      return NextResponse.json({ success: true });
    }

    // 6. Sukses -> proses sesuai TIPE transaksi
    const tipe = trx.tipe || "kuota"; // baris lama sebelum migrasi -> anggap 'kuota'

    if (tipe === "modul") {
      // ── Tandai modul ini sudah lunas untuk email tersebut ──
      const { data: existing } = await supabase
        .from("modul_unduhan")
        .select("id")
        .eq("email", trx.email)
        .eq("modul_id", trx.modul_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("modul_unduhan")
          .update({ status: "lunas", harga_dibayar: trx.harga, metode_pembayaran: "midtrans" })
          .eq("id", existing.id);
      } else {
        await supabase.from("modul_unduhan").insert({
          email: trx.email,
          modul_id: trx.modul_id,
          jenis: "berbayar",
          harga_dibayar: trx.harga,
          status: "lunas",
          metode_pembayaran: "midtrans",
        });
      }

      return NextResponse.json({ success: true });
    }

    // ── tipe === "kuota": tambah kuota & set plan jadi premium ──
    const { data: userRow } = await supabase
      .from("users")
      .select("kuota_tryout")
      .eq("email", trx.email)
      .single();

    const kuotaBaru = (userRow?.kuota_tryout || 0) + (trx.paket_jumlah || 0);

    await supabase
      .from("users")
      .update({
        plan: "premium", // BUG LAMA: sebelumnya "status_akun" (kolom yang tidak dipakai sistem)
        kuota_tryout: kuotaBaru,
      })
      .eq("email", trx.email);

    await supabase.from("riwayat_kuota").insert({
      email: trx.email,
      jenis: "tambah",
      jumlah: trx.paket_jumlah || 0,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("webhook error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}