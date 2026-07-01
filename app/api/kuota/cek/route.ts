// FILE: app/api/kuota/cek/route.ts
// GET /api/kuota/cek
//
// PERUBAHAN: email TIDAK LAGI diambil dari query string (?email=...)
// karena itu bisa diubah bebas oleh siapa pun lewat URL/DevTools --
// sekarang diambil dari session cookie httpOnly yang di-set saat
// login, jadi dijamin sesuai user yang benar-benar sedang login.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSessionUser } from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { session, blockedByReset } = getActiveSessionUser(req);

  if (blockedByReset) {
    return NextResponse.json(
      { success: false, mustResetPassword: true, message: "Harap ganti password terlebih dahulu." },
      { status: 403 }
    );
  }

  if (!session) {
    return NextResponse.json(
      { success: false, message: "Sesi tidak valid, silakan login ulang." },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("users")
    .select("plan, kuota_tryout")
    .eq("email", session.email)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "User tidak ditemukan." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    plan: data.plan || "free",
    kuota: data.kuota_tryout || 0,
  });
}