// FILE: app/api/modul/beli/route.ts
// POST /api/modul/beli
// Body: { email, modul_id, metode_pembayaran }
//
// Membuat (atau memperbarui) baris modul_unduhan dengan status
// 'pending' -- representasi "user memilih metode pembayaran X dan
// menunggu konfirmasi". Endpoint ini TIDAK menandai lunas; itu
// tugas /api/modul/konfirmasi (lihat catatan TODO integrasi
// payment gateway di sana).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, modul_id, metode_pembayaran } = await req.json();

    if (!email || !modul_id || !metode_pembayaran) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    const { data: modulRow, error: errModul } = await supabase
      .from("modul")
      .select("id, akses, harga")
      .eq("id", modul_id)
      .maybeSingle();

    if (errModul || !modulRow) {
      return NextResponse.json({ success: false, message: "Modul tidak ditemukan." }, { status: 404 });
    }

    if (modulRow.akses !== "berbayar") {
      return NextResponse.json(
        { success: false, message: "Modul ini gratis, tidak perlu dibeli." },
        { status: 400 }
      );
    }

    // Sudah lunas sebelumnya? Tidak usah buat transaksi baru.
    const { data: existing } = await supabase
      .from("modul_unduhan")
      .select("id, status")
      .eq("email", email)
      .eq("modul_id", modul_id)
      .maybeSingle();

    if (existing?.status === "lunas") {
      return NextResponse.json({ success: true, sudah_lunas: true });
    }

    if (existing) {
      const { error: errUpdate } = await supabase
        .from("modul_unduhan")
        .update({ status: "pending", metode_pembayaran, harga_dibayar: modulRow.harga })
        .eq("id", existing.id);
      if (errUpdate) {
        return NextResponse.json({ success: false, message: errUpdate.message }, { status: 500 });
      }
    } else {
      const { error: errInsert } = await supabase.from("modul_unduhan").insert({
        email,
        modul_id,
        jenis: "berbayar",
        harga_dibayar: modulRow.harga,
        status: "pending",
        metode_pembayaran,
      });
      if (errInsert) {
        return NextResponse.json({ success: false, message: errInsert.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, sudah_lunas: false });
  } catch (err: any) {
    console.error("modul/beli error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}