// FILE: app/api/payment/webhook/route.ts
// POST /api/payment/webhook
//
// Dipanggil OTOMATIS oleh Midtrans (server-to-server notification).
// Daftarkan URL ini di Midtrans Dashboard → Settings → Configuration
// → Payment Notification URL, contoh: https://domainmu.com/api/payment/webhook

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

    // 6. Jika sukses → tambah kuota & upgrade status akun
    if (statusBaru === "success") {
      const { data: userRow } = await supabase
        .from("users")
        .select("kuota_tryout")
        .eq("email", trx.email)
        .single();

      const kuotaBaru = (userRow?.kuota_tryout || 0) + trx.paket_jumlah;

      await supabase
        .from("users")
        .update({
          status_akun: "premium",
          kuota_tryout: kuotaBaru,
        })
        .eq("email", trx.email);

      await supabase.from("riwayat_kuota").insert({
        email: trx.email,
        jenis: "tambah",
        jumlah: trx.paket_jumlah,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("webhook error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}