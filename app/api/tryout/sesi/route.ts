// FILE: app/api/tryout/sesi/route.ts
// GET /api/tryout/sesi?email=&tryout_id=
//
// Dipanggil saat kerjakan-tryout.html dibuka, untuk cek apakah ada
// sesi sebelumnya yang belum selesai (selesai=false) — supaya kalau
// user refresh/balik lagi, jawaban & sisa waktu tidak hilang.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const tryoutId = searchParams.get("tryout_id");

  if (!email || !tryoutId) {
    return NextResponse.json(
      { success: false, message: "email dan tryout_id wajib diisi." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("sesi_tryout")
    .select("jawaban_cache, raguan_cache, sisa_detik, selesai")
    .eq("email", email)
    .eq("tryout_id", tryoutId)
    .eq("selesai", false)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || null });
}