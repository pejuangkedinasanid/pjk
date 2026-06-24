// FILE: app/api/akses-gratis/verify/route.ts
// POST /api/akses-gratis/verify
// Body: { tryout_id, email, password }
//
// PERBAIKAN (revisi ini): sebelum cek password sama sekali, tolak dulu
// kalau user ini SUDAH PERNAH menyelesaikan tryout ini dengan mode
// gratis (hasil_tryout.selesai=true). Akun gratis hanya boleh
// mengerjakan satu tryout satu kali; untuk mengulang harus upgrade ke
// Premium. Ini lapisan keamanan tambahan di server — frontend
// (tryout-tersedia.html) seharusnya sudah menyembunyikan tombol
// "Kerjakan Sekarang" dan menggantinya dengan "Upgrade ke Premium"
// memakai flag sudah_gratis dari /api/tryout, tapi endpoint ini tetap
// menolak kalau diakses langsung / dimanipulasi dari klien.
//
// Kalau belum pernah selesai (termasuk yang baru mengisi password tapi
// belum menyelesaikan ujian -> masih boleh resume), lanjut seperti biasa:
//   1. Password BERSAMA di kolom tryout.password_akses.
//   2. Password PER-USER di tabel akses_gratis.
//
// TAMBAHAN (revisi ini): setiap kali password berhasil diverifikasi,
// dicatat ke tabel akses_tryout (mode='gratis') -- supaya
// tryout-saya.html bisa menampilkan TO ini di tab "Belum Dikerjakan"
// walau usernya belum pernah menyelesaikan ujiannya. Dicek dulu
// (select) sebelum insert supaya tidak dobel kalau password yang sama
// diverifikasi ulang sebelum tryout-nya selesai dikerjakan (misal user
// resume sesi).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function catatAksesGratis(email: string, tryout_id: number | string) {
  try {
    const { data: existing } = await supabase
      .from("akses_tryout")
      .select("id")
      .eq("email", email)
      .eq("tryout_id", tryout_id)
      .eq("mode", "gratis")
      .maybeSingle();

    if (!existing) {
      const { error } = await supabase
        .from("akses_tryout")
        .insert({ email, tryout_id, mode: "gratis" });
      if (error) {
        console.error("GAGAL mencatat akses_tryout (gratis):", error);
      }
    }
  } catch (err) {
    console.error("catatAksesGratis error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tryout_id, email, password } = await req.json();

    if (!tryout_id || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    // ── 0. Sudah pernah MENYELESAIKAN tryout ini secara gratis? Tolak. ──
    const { data: sudahSelesai, error: errCekSelesai } = await supabase
      .from("hasil_tryout")
      .select("id")
      .eq("email", email)
      .eq("tryout_id", tryout_id)
      .eq("mode", "gratis")
      .eq("selesai", true)
      .maybeSingle();

    if (errCekSelesai) {
      return NextResponse.json({ success: false, message: errCekSelesai.message }, { status: 500 });
    }

    if (sudahSelesai) {
      return NextResponse.json(
        {
          success: false,
          sudah_pernah: true,
          message: "Kamu sudah pernah mengerjakan tryout ini secara gratis. Upgrade ke Premium untuk mengerjakan berkali-kali.",
        },
        { status: 403 }
      );
    }

    // ── 1. Cek password BERSAMA di tabel tryout ──
    const { data: tryoutRow } = await supabase
      .from("tryout")
      .select("password_akses")
      .eq("id", tryout_id)
      .single();

    if (
      tryoutRow &&
      tryoutRow.password_akses &&
      tryoutRow.password_akses.trim() === password.trim()
    ) {
      await catatAksesGratis(email, tryout_id);
      return NextResponse.json({ success: true, message: "Akses diberikan (password bersama)." });
    }

    // ── 2. Kalau tidak cocok, cek password PER-USER di akses_gratis ──
    const { data: aksesRow, error: errAkses } = await supabase
      .from("akses_gratis")
      .select("password_akses, status")
      .eq("tryout_id", tryout_id)
      .eq("email", email)
      .maybeSingle();

    if (!aksesRow) {
      return NextResponse.json(
        { success: false, message: "Password salah, atau kamu belum memiliki akses untuk tryout ini." },
        { status: 404 }
      );
    }

    if (aksesRow.status !== "aktif") {
      return NextResponse.json(
        { success: false, message: "Akses kamu belum aktif. Hubungi admin." },
        { status: 403 }
      );
    }

    if (aksesRow.password_akses !== password.trim()) {
      return NextResponse.json(
        { success: false, message: "Password salah. Silakan coba lagi." },
        { status: 401 }
      );
    }

    await catatAksesGratis(email, tryout_id);
    return NextResponse.json({ success: true, message: "Akses diberikan (password per-user)." });
  } catch (err) {
    console.error("akses-gratis/verify error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}