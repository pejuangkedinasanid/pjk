// FILE: app/api/auth/login/route.ts
// POST /api/auth/login
// Body: { email, password }
//
// PERUBAHAN dari versi sebelumnya: setelah login berhasil, sekarang
// juga men-set cookie session httpOnly. Endpoint lain (kuota/cek,
// tryout/riwayat, dll) akan membaca identitas dari cookie ini,
// BUKAN dari parameter email di URL yang bisa diubah bebas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSessionCookieValue, SESSION_COOKIE_OPTIONS } from "@/lib/session";

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
      return NextResponse.json(
        { success: false, message: "Email atau password salah." },
        { status: 401 }
      );
    }

    const user = data[0];

    const response = NextResponse.json({ success: true, user });

    // Set cookie session httpOnly -- ini yang dipakai endpoint lain
    // untuk tahu "siapa yang sedang login", bukan query string email.
    const cookieValue = createSessionCookieValue({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    response.cookies.set(
      SESSION_COOKIE_OPTIONS.name,
      cookieValue,
      SESSION_COOKIE_OPTIONS
    );

    return response;
  } catch (err: any) {
    console.error("auth/login error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}