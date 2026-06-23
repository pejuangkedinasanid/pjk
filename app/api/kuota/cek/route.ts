// FILE: app/api/kuota/cek/route.ts
// GET /api/kuota/cek?email=
// Baca status_akun & sisa kuota_tryout milik user (read-only).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email) {
    return NextResponse.json(
      { success: false, message: "Email wajib diisi." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("users")
    .select("status_akun, kuota_tryout")
    .eq("email", email)
    .single();

  if (error || !data) {
    console.error("kuota/cek error:", error);
    return NextResponse.json(
      { success: false, message: "User tidak ditemukan." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    status_akun: data.status_akun,
    kuota: data.kuota_tryout || 0,
  });
}