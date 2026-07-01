// FILE: app/api/akses-gratis/verify/route.ts
// POST /api/akses-gratis/verify
// Body: { tryout_id, email, password }
//
// PERBAIKAN (revisi ini): password_akses di database sekarang ADA YANG
// SUDAH DI-HASH pakai bcrypt (contoh: "$2a$06$..."), tapi sebagian data
// lama masih PLAIN TEXT (contoh: "456321"). Sebelumnya kode ini
// membandingkan dengan "===" / "!==" langsung, yang PASTI GAGAL untuk
// baris yang sudah di-hash (plain text tidak akan pernah sama persis
// dengan hash-nya walau passwordnya benar).
//
// Fungsi cocokPassword() di bawah ini mendeteksi otomatis:
//   - Kalau nilai di DB berformat bcrypt ($2a$/$2b$/$2y$) -> pakai
//     bcrypt.compare() untuk membandingkan dengan input user.
//   - Kalau bukan (data lama, masih plain text) -> tetap dibandingkan
//     sebagai string biasa, supaya tryout lama yang belum sempat
//     di-hash tetap bisa dipakai tanpa perlu migrasi manual dulu.
//
// Sisanya (logika "sudah pernah selesai", catat ke akses_tryout, dst)
// tidak diubah dari versi sebelumnya.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Deteksi apakah sebuah string adalah hash bcrypt ($2a$/$2b$/$2y$...)
function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(value);
}

// Bandingkan password input user dengan nilai yang tersimpan di DB.
// Otomatis pakai bcrypt.compare kalau nilai DB adalah hash bcrypt,
// atau perbandingan string biasa kalau masih data lama (plain text).
async function cocokPassword(inputPassword: string, storedValue: string): Promise<boolean> {
  if (!storedValue) return false;

  const stored = storedValue.trim();
  const input = inputPassword.trim();

  if (isBcryptHash(stored)) {
    try {
      return await bcrypt.compare(input, stored);
    } catch (err) {
      console.error("bcrypt.compare error:", err);
      return false;
    }
  }

  // Fallback: data lama yang belum di-hash
  return stored === input;
}

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

    if (tryoutRow && tryoutRow.password_akses) {
      const cocok = await cocokPassword(password, tryoutRow.password_akses);
      if (cocok) {
        await catatAksesGratis(email, tryout_id);
        return NextResponse.json({ success: true, message: "Akses diberikan (password bersama)." });
      }
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

    const cocokPerUser = await cocokPassword(password, aksesRow.password_akses);
    if (!cocokPerUser) {
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