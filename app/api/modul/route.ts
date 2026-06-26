// FILE: app/api/modul/route.ts
// GET /api/modul?email=...
//
// Daftar semua modul yang sudah dipublish, plus status akses user ini
// per modul:
//   - status_akses: 'belum' | 'sudah'
//   - jenis_akses_user: 'gratis' | 'berbayar' | null (cara dia akses)
//   - status_pembayaran: 'pending' | 'lunas' | null (khusus modul berbayar)

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

    const { data: modulRows, error } = await supabase
      .from("modul")
      .select("id, judul, deskripsi, akses, harga, banner_url, created_at")
      .eq("status", "publish")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    let unduhanMap = new Map<number, any>();
    if (email && modulRows?.length) {
      const ids = modulRows.map((m: any) => m.id);
      const { data: unduhanRows } = await supabase
        .from("modul_unduhan")
        .select("modul_id, jenis, status")
        .eq("email", email)
        .in("modul_id", ids);

      (unduhanRows || []).forEach((u: any) => unduhanMap.set(u.modul_id, u));
    }

    const data = (modulRows || []).map((m: any) => {
      const u = unduhanMap.get(m.id);
      return {
        ...m,
        status_akses: u && u.status === "lunas" ? "sudah" : "belum",
        jenis_akses_user: u?.jenis || null,
        status_pembayaran: u?.status || null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("modul list error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}