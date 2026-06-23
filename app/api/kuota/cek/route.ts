// FILE: app/api/kuota/cek/route.ts
// GET /api/kuota/cek?email=
//
// PERBAIKAN: sebelumnya route ini salah pakai nama kolom
// "status_akun" — skema tabel "users" yang sebenarnya pakai
// kolom "plan" ('free' | 'premium'). Disesuaikan di sini.

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
    .select("plan, kuota_tryout")
    .eq("email", email)
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