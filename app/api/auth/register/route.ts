// FILE: app/api/auth/register/route.ts
// POST /api/auth/register
// Body: { nama, username, email, password, whatsapp, instagram,
//         provinsi, tahun_seleksi, sekolah_kedinasan, source }
//
// PERUBAHAN dari versi sebelumnya:
// - Password sekarang di-hash (bcrypt via pgcrypto) di dalam database
//   lewat fungsi register_user(), BUKAN disimpan apa adanya lagi.
// - Cek-duplikat-email + insert sekarang ATOMIC dalam satu fungsi SQL
//   (menghindari race condition dua pendaftaran email sama yang
//   nyaris bersamaan lolos berdua).
// - Pola service role key & alur kirim OTP TETAP SAMA seperti
//   sebelumnya, tidak ada perubahan di situ.
//
// PENTING: pastikan 01_setup_auth_functions.sql dan
// 02_update_register_function.sql sudah dijalankan di database
// sebelum deploy perubahan ini, dan login.html sudah diganti ke
// versi baru yang lewat /api/auth/login -- kalau tidak, user lama
// yang loginnya masih pakai cara lama akan gagal karena passwordnya
// sudah ter-hash.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      nama, username, email, password,
      whatsapp, instagram, provinsi, tahun_seleksi,
      sekolah_kedinasan, source,
    } = body;

    if (!nama || !username || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Nama, username, email, dan password wajib diisi." },
        { status: 400 }
      );
    }

    const emailLower = String(email).trim().toLowerCase();

    if (!isValidEmail(emailLower)) {
      return NextResponse.json(
        { success: false, message: "Format email tidak valid." },
        { status: 400 }
      );
    }

    if (String(password).length < 8) {
      return NextResponse.json(
        { success: false, message: "Password minimal 8 karakter." },
        { status: 400 }
      );
    }

    // ── Cek-duplikat + insert dilakukan ATOMIC di dalam fungsi SQL,
    //    password di-hash di sana juga (crypt + gen_salt('bf')) ──
    const { data, error } = await supabase.rpc("register_user", {
      p_nama: nama,
      p_username: username,
      p_email: emailLower,
      p_password: password,
      p_whatsapp: whatsapp || null,
      p_instagram: instagram || null,
      p_provinsi: provinsi || null,
      p_tahun_seleksi: tahun_seleksi || null,
      p_sekolah_kedinasan: sekolah_kedinasan || null,
      p_source: source || null,
    });

    if (error) {
      if (error.message?.includes("EMAIL_TAKEN")) {
        return NextResponse.json(
          { success: false, message: "Email sudah terdaftar. Silakan login." },
          { status: 409 }
        );
      }
      console.error("Register RPC error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal membuat akun: " + error.message },
        { status: 500 }
      );
    }

    const inserted = data?.[0];
    if (!inserted) {
      return NextResponse.json(
        { success: false, message: "Gagal membuat akun." },
        { status: 500 }
      );
    }

    // ── Kirim OTP -- sama persis seperti sebelumnya ──
    try {
      const otpRes = await fetch(new URL("/api/otp/send", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailLower }),
      });
      const otpJson = await otpRes.json();

      if (!otpJson.success) {
        return NextResponse.json({
          success: true,
          otp_sent: false,
          email: emailLower,
          message: "Akun dibuat, tapi OTP gagal terkirim: " + otpJson.message,
        });
      }
    } catch (otpErr) {
      console.error("Kirim OTP gagal:", otpErr);
      return NextResponse.json({
        success: true,
        otp_sent: false,
        email: emailLower,
        message: "Akun dibuat, tapi terjadi kesalahan saat mengirim OTP.",
      });
    }

    return NextResponse.json({ success: true, otp_sent: true, email: emailLower });
  } catch (err: any) {
    console.error("auth/register error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}