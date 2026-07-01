// FILE: app/api/auth/reset-password-wajib/route.ts
// POST /api/auth/reset-password-wajib
// Body: { passwordBaru }
//
// Endpoint ini SENGAJA dipanggil pakai getSessionUser() biasa (bukan
// getActiveSessionUser), karena justru endpoint inilah yang harus
// tetap bisa diakses meski user berstatus harus_reset_password=true.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getSessionUser,
  createSessionCookieValue,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const session = getSessionUser(req);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Sesi tidak valid, silakan login ulang." },
        { status: 401 }
      );
    }

    const { passwordBaru } = await req.json();

    if (!passwordBaru || String(passwordBaru).length < 8) {
      return NextResponse.json(
        { success: false, message: "Password baru minimal 8 karakter." },
        { status: 400 }
      );
    }

    const { data: berhasil, error } = await supabase.rpc("reset_password_wajib", {
      p_email: session.email,
      p_password_baru: passwordBaru,
    });

    if (error || !berhasil) {
      console.error("reset_password_wajib error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal mengubah password." },
        { status: 500 }
      );
    }

    // Terbitkan cookie session BARU dengan harusResetPassword: false,
    // supaya user langsung dapat akses penuh tanpa perlu login ulang.
    const response = NextResponse.json({ success: true });

    const cookieValue = createSessionCookieValue({
      id: session.id,
      email: session.email,
      role: session.role,
      harusResetPassword: false,
    });
    response.cookies.set(
      SESSION_COOKIE_OPTIONS.name,
      cookieValue,
      SESSION_COOKIE_OPTIONS
    );

    return response;
  } catch (err: any) {
    console.error("reset-password-wajib error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}