// FILE: app/api/video/route.ts
// GET /api/video?kategori=...(opsional)
//
// Daftar video pembahasan yang sudah dipublish, untuk video.html.
// Publik -- tidak perlu login/email, tapi tetap lewat service role
// di server supaya konsisten & tidak kena RLS.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const kategori = searchParams.get("kategori");

    let query = supabase
      .from("video_pembahasan")
      .select("id, judul, kategori, youtube_url, banner_url, created_at")
      .eq("status", "publish")
      .order("created_at", { ascending: false });

    if (kategori) {
      query = query.eq("kategori", kategori);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("video list error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}