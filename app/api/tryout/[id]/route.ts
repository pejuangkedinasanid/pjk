import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("tryout_publik")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    const { data: d2, error: e2 } = await supabase
      .from("tryout")
      .select("id, nama, deskripsi, akses, is_premium, banner_url, tanggal_mulai, tanggal_selesai, bebas_waktu, durasi, jumlah_soal, passing_twk, passing_tiu, passing_tkp, video_url, pdf_url, gform_url, status, aktif, created_at")
      .eq("id", id)
      .maybeSingle();

    if (e2 || !d2) {
      return NextResponse.json(
        { success: false, message: "Tryout tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: d2 });
  }

  return NextResponse.json({ success: true, data });
}