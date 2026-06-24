// FILE: app/api/kuota/pakai/route.ts
// POST /api/kuota/pakai
// Body: { email, tryout_id }
//
// PERBAIKAN (revisi ini): sebelum memotong kuota, cek dulu apakah
// email+tryout_id ini SUDAH PERNAH di-unlock sebelumnya (tercatat di
// tabel akses_tryout, mode='premium'). Kalau sudah, langsung kembalikan
// success TANPA memotong kuota lagi — supaya tryout yang sama bisa
// dikerjakan berkali-kali tanpa mengurangi kuota. Kuota hanya dipotong
// satu kali, di percobaan pertama untuk tryout tersebut.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, tryout_id } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    const { data: userRow, error: errUser } = await supabase
      .from("users")
      .select("kuota_tryout, plan")
      .eq("email", email)
      .single();

    if (errUser || !userRow) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    // ── 1. Sudah pernah unlock tryout ini sebelumnya? Tidak usah potong kuota lagi ──
    if (tryout_id) {
      const { data: aksesRow, error: errAkses } = await supabase
        .from("akses_tryout")
        .select("id")
        .eq("email", email)
        .eq("tryout_id", tryout_id)
        .eq("mode", "premium")
        .maybeSingle();

      if (errAkses) {
        return NextResponse.json({ success: false, message: errAkses.message }, { status: 500 });
      }

      if (aksesRow) {
        return NextResponse.json({
          success: true,
          sudah_unlock: true,
          kuota: userRow.kuota_tryout || 0,
          plan: userRow.plan,
          message: "Tryout ini sudah pernah dibuka sebelumnya, kuota tidak dipotong lagi.",
        });
      }
    }

    // ── 2. Belum pernah unlock -> cek kuota seperti biasa ──
    if (userRow.plan !== "premium" || !userRow.kuota_tryout || userRow.kuota_tryout <= 0) {
      return NextResponse.json(
        {
          success: false,
          kuota_habis: true,
          message: "Kuota tryout premium kamu sudah habis.",
          kuota: userRow.kuota_tryout || 0,
        },
        { status: 402 }
      );
    }

    const kuotaBaru = userRow.kuota_tryout - 1;

    const { error: errUpdate } = await supabase
      .from("users")
      .update({ kuota_tryout: kuotaBaru })
      .eq("email", email);

    if (errUpdate) {
      return NextResponse.json(
        { success: false, message: errUpdate.message },
        { status: 500 }
      );
    }

    await supabase.from("riwayat_kuota").insert({
      email,
      tryout_id: tryout_id || null,
      jenis: "pakai",
      jumlah: -1,
    });

    // ── 3. Catat tryout ini sebagai sudah di-unlock, supaya ke depannya gratis ──
    // Pakai insert biasa (bukan upsert+onConflict) supaya tidak bergantung
    // pada nama constraint unique yang harus cocok persis -- dan errornya
    // WAJIB dicek, karena kalau baris ini gagal tersimpan tanpa ketahuan,
    // sistem akan selalu mengira "belum pernah unlock" dan memotong kuota
    // lagi di setiap percobaan berikutnya (inilah penyebab dobel potong).
    if (tryout_id) {
      const { error: errCatat } = await supabase
        .from("akses_tryout")
        .insert({ email, tryout_id, mode: "premium" });

      if (errCatat) {
        console.error("GAGAL mencatat akses_tryout (unlock tidak tersimpan):", errCatat);
      }
    }

    return NextResponse.json({
      success: true,
      sudah_unlock: false,
      kuota: kuotaBaru,
      plan: userRow.plan,
    });
  } catch (err) {
    console.error("kuota/pakai error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}