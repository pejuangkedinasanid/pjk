// FILE: app/api/auth/login/route.ts
// POST /api/auth/login
// Body: { email, password }
//
// Menggantikan query langsung dari browser di login.html lama
// (yang membandingkan password mentah lewat anon key -- itu yang
// menyebabkan kebocoran password semua user).
//
// Sengaja pakai pola PERSIS SAMA dengan register/route.ts: service
// role key, supaya konsisten dan tidak terbentur RLS.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, message: "Email dan password wajib diisi." },
        { status: 400 }
      );
    }

    const emailLower = String(email).trim().toLowerCase();

    // Memanggil fungsi SQL login_user() -- password dibandingkan
    // dengan hash bcrypt di sisi database, dan kolom password TIDAK
    // PERNAH ikut ke response ini.
    const { data, error } = await supabase.rpc("login_user", {
      p_email: emailLower,
      p_password: password,
    });

    if (error) {
      console.error("Login RPC error:", error);
      return NextResponse.json(
        { success: false, message: "Terjadi kesalahan sistem." },
        { status: 500 }
      );
    }

    if (!data || data.length === 0) {
      // Pesan generik -- tidak membedakan "email tidak ada" vs
      // "password salah", supaya tidak membantu penyerang menebak
      // email mana yang terdaftar.
      return NextResponse.json(
        { success: false, message: "Email atau password salah." },
        { status: 401 }
      );
    }

    const user = data[0];

    // TODO (disarankan, tidak mendesak): ganti localStorage di
    // frontend dengan cookie httpOnly yang di-set di sini, supaya
    // tidak bisa dibaca skrip lain di halaman (proteksi XSS).

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    console.error("auth/login error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}