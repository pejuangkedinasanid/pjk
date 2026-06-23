// FILE: app/api/tryout/riwayat/route.ts
// GET /api/tryout/riwayat?email=&tryout_id=
//
// Dipakai untuk grafik "Analisis Perkembangan" (khusus user
// premium) di halaman hasil — menampilkan nilai dari semua
// percobaan user pada tryout yang sama, urut dari yang terlama.

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
    .from("hasil_tryout")
    .select("id, nilai, nilai_twk, nilai_tiu, nilai_tkp, durasi_menit, is_first_attempt, created_at")
    .eq("email", email)
    .eq("tryout_id", tryoutId)
    .eq("selesai", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || [] });
}