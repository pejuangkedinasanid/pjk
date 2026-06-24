// FILE: app/api/modul/unduh/route.ts
// GET /api/modul/unduh?email=...&modul_id=...
//
// Dipakai untuk MENGAMBIL pdf_url sebuah modul setelah user sudah
// punya akses (gratis sudah pernah unduh, atau berbayar sudah lunas).
// Dicek di server -- bukan sekadar dipercaya dari frontend -- supaya
// modul berbayar yang belum lunas tidak bisa diunduh langsung dengan
// menebak URL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const modulId = searchParams.get("modul_id");

    if (!email || !modulId) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    const { data: modulRow, error: errModul } = await supabase
      .from("modul")
      .select("id, akses, pdf_url")
      .eq("id", modulId)
      .maybeSingle();

    if (errModul || !modulRow) {
      return NextResponse.json({ success: false, message: "Modul tidak ditemukan." }, { status: 404 });
    }

    if (modulRow.akses === "gratis") {
      return NextResponse.json({ success: true, pdf_url: modulRow.pdf_url });
    }

    // Berbayar -> wajib sudah lunas
    const { data: unduhanRow } = await supabase
      .from("modul_unduhan")
      .select("status")
      .eq("email", email)
      .eq("modul_id", modulId)
      .maybeSingle();

    if (unduhanRow?.status !== "lunas") {
      return NextResponse.json(
        { success: false, message: "Kamu belum membeli modul ini." },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, pdf_url: modulRow.pdf_url });
  } catch (err: any) {
    console.error("modul/unduh error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}