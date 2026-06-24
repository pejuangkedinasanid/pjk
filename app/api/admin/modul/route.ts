// FILE: app/api/admin/modul/route.ts
// GET  /api/admin/modul              -> daftar modul + statistik per modul
// POST /api/admin/modul              -> buat modul baru
// Body POST: { judul, deskripsi, akses, harga, pdf_url, thumbnail_url, status }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: modulRows, error } = await supabase
      .from("modul")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    const { data: unduhanRows, error: errUnduhan } = await supabase
      .from("modul_unduhan")
      .select("modul_id, jenis, status, harga_dibayar")
      .eq("status", "lunas");

    if (errUnduhan) {
      return NextResponse.json({ success: false, message: errUnduhan.message }, { status: 500 });
    }

    const data = (modulRows || []).map((m: any) => {
      const rows = (unduhanRows || []).filter((u: any) => u.modul_id === m.id);
      const jumlahGratis = rows.filter((u: any) => u.jenis === "gratis").length;
      const jumlahBeli   = rows.filter((u: any) => u.jenis === "berbayar").length;
      const pendapatan   = rows
        .filter((u: any) => u.jenis === "berbayar")
        .reduce((sum: number, u: any) => sum + (u.harga_dibayar || 0), 0);

      return { ...m, jumlah_gratis: jumlahGratis, jumlah_beli: jumlahBeli, pendapatan };
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("admin/modul GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { judul, deskripsi, akses, harga, pdf_url, thumbnail_url, status } = body;

    if (!judul || !pdf_url) {
      return NextResponse.json(
        { success: false, message: "Judul dan link PDF wajib diisi." },
        { status: 400 }
      );
    }

    if (akses === "berbayar" && (!harga || harga <= 0)) {
      return NextResponse.json(
        { success: false, message: "Harga wajib diisi untuk modul berbayar." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("modul")
      .insert({
        judul,
        deskripsi: deskripsi || null,
        akses: akses === "berbayar" ? "berbayar" : "gratis",
        harga: akses === "berbayar" ? harga : 0,
        pdf_url,
        thumbnail_url: thumbnail_url || null,
        status: status === "draft" ? "draft" : "publish",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("admin/modul POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}