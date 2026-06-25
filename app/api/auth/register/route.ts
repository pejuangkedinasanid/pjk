// FILE: app/api/auth/register/route.ts
// POST /api/auth/register
// Body: { nama, username, email, password, whatsapp, instagram,
//         provinsi, tahun_seleksi, sekolah_kedinasan, source }
//
// MENGGANTIKAN insert langsung dari browser (anon key) di register.html.
// Akar masalah "Akun dibuat, tapi gagal kirim OTP: Email tidak
// ditemukan" kemungkinan besar karena INSERT dari browser (anon key,
// project A / RLS) dan pengecekan email di /api/otp/send (service
// role, project B) tidak konsisten satu sama lain.
//
// Dengan memindahkan INSERT ke sini, route ini dan /api/otp/send
// SELALU memakai persis kredensial yang sama (NEXT_PUBLIC_SUPABASE_URL
// + SUPABASE_SERVICE_ROLE_KEY dari environment server) -- jadi user
// yang baru di-insert PASTI ketemu saat OTP dikirim, sekaligus tidak
// lagi tergantung/terbentur RLS sama sekali (service role bypass RLS).
//
// CATATAN: password TETAP disimpan apa adanya (tidak di-hash) di sini,
// supaya tidak merusak kompatibilitas dengan login.html yang mungkin
// masih membandingkan plain text. Hashing password sebaiknya dibenahi
// bersamaan dengan login.html -- beri tahu saya kalau mau sekalian
// dibenarkan.

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

    // ── 1. Cek email sudah terdaftar atau belum ──
    const { data: existing, error: errCek } = await supabase
      .from("users")
      .select("id")
      .eq("email", emailLower)
      .maybeSingle();

    if (errCek) {
      return NextResponse.json({ success: false, message: errCek.message }, { status: 500 });
    }

    if (existing) {
      return NextResponse.json(
        { success: false, message: "Email sudah terdaftar. Silakan login." },
        { status: 409 }
      );
    }

    // ── 2. Insert user baru ──
    const { data: inserted, error: errInsert } = await supabase
      .from("users")
      .insert({
        nama,
        username,
        email: emailLower,
        password, // lihat catatan di atas soal hashing
        whatsapp: whatsapp || null,
        instagram: instagram || null,
        provinsi: provinsi || null,
        tahun_seleksi: tahun_seleksi || null,
        sekolah_kedinasan: sekolah_kedinasan || null,
        source: source || null,
        role: "peserta",
        is_verified: false,
        created_at: new Date().toISOString(),
      })
      .select("id, email")
      .single();

    if (errInsert) {
      console.error("Insert user error:", errInsert);
      return NextResponse.json(
        { success: false, message: "Gagal membuat akun: " + errInsert.message },
        { status: 500 }
      );
    }

    // ── 3. Kirim OTP -- panggil /api/otp/send di server yang sama,
    //        kredensial Supabase-nya otomatis konsisten ──
    try {
      const otpRes = await fetch(new URL("/api/otp/send", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailLower }),
      });
      const otpJson = await otpRes.json();

      if (!otpJson.success) {
        // Akun sudah dibuat, cuma OTP yang gagal -- tetap kasih tahu
        // klien sukses=true biar bisa redirect ke halaman OTP dan
        // pakai tombol "Kirim Ulang OTP" di sana.
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