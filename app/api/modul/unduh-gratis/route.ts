// FILE: app/api/modul/unduh-gratis/route.ts
// POST /api/modul/unduh-gratis
// Body: { email, modul_id }
//
// Mencatat unduhan gratis (kalau belum pernah) dan mengembalikan
// pdf_url-nya. Modul berbayar TIDAK BOLEH lewat endpoint ini --
// dicek di server, bukan cuma dipercaya dari frontend.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, modul_id } = await req.json();

    if (!email || !modul_id) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    const { data: modulRow, error: errModul } = await supabase
      .from("modul")
      .select("id, akses, pdf_url, status")
      .eq("id", modul_id)
      .maybeSingle();

    if (errModul || !modulRow) {
      return NextResponse.json({ success: false, message: "Modul tidak ditemukan." }, { status: 404 });
    }

    if (modulRow.akses !== "gratis") {
      return NextResponse.json(
        { success: false, message: "Modul ini berbayar, tidak bisa diunduh lewat jalur gratis." },
        { status: 403 }
      );
    }

    // Catat unduhan kalau belum pernah (cek dulu, supaya tidak melanggar unique constraint)
    const { data: existing } = await supabase
      .from("modul_unduhan")
      .select("id")
      .eq("email", email)
      .eq("modul_id", modul_id)
      .maybeSingle();

    if (!existing) {
      const { error: errInsert } = await supabase.from("modul_unduhan").insert({
        email,
        modul_id,
        jenis: "gratis",
        harga_dibayar: 0,
        status: "lunas",
      });
      if (errInsert) {
        console.error("GAGAL mencatat modul_unduhan (gratis):", errInsert);
      }
    }

    return NextResponse.json({ success: true, pdf_url: modulRow.pdf_url });
  } catch (err: any) {
    console.error("modul/unduh-gratis error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}