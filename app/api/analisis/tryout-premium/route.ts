// FILE: app/api/analisis/tryout-premium/route.ts
// GET /api/analisis/tryout-premium?email=...
//
// Daftar tryout yang sudah PERNAH DISELESAIKAN user ini dengan
// mode='premium' (selesai=true). Cuma tryout di daftar ini yang
// boleh dipilih untuk dianalisis.

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

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("hasil_tryout")
      .select("tryout_id, nama_tryout, nilai, created_at")
      .eq("email", email)
      .eq("mode", "premium")
      .eq("selesai", true)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    if (!data || !data.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Dedupe per tryout_id — ambil nama_tryout dari baris terbaru
    // sekaligus hitung berapa kali tryout itu dikerjakan
    const map = new Map<
      number,
      { tryout_id: number; nama_tryout: string; jumlah_percobaan: number; nilai_terbaru: number }
    >();

    (data || []).forEach((r: any) => {
      if (!map.has(r.tryout_id)) {
        map.set(r.tryout_id, {
          tryout_id       : r.tryout_id,
          nama_tryout     : r.nama_tryout || "Tryout",
          jumlah_percobaan: 1,
          nilai_terbaru   : r.nilai ?? 0,
        });
      } else {
        map.get(r.tryout_id)!.jumlah_percobaan += 1;
      }
    });

    return NextResponse.json({ success: true, data: Array.from(map.values()) });

  } catch (err: any) {
    console.error("analisis/tryout-premium error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}