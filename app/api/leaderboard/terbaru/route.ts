// FILE: app/api/leaderboard/terbaru/route.ts
// GET /api/leaderboard/terbaru
//
// Dipakai landing page (publik, tanpa login) untuk menampilkan
// leaderboard dari TRYOUT TERBARU yang dipublish admin.
//
// ASUMSI SKEMA (tolong koreksi kalau beda): tabel/view "leaderboard_view"
// punya kolom "tryout_id" dan "nilai", dan hanya berisi baris dengan
// is_first_attempt=true (sesuai komentar di app/api/tryout/submit/route.ts
// kamu). Kalau nama kolom nyatanya beda, response tetap aman (tidak
// expose kolom mentah ke publik -- field selain nama/nilai/plan tidak
// pernah dikirim ke klien), tapi datanya bisa kosong/salah sampai
// disesuaikan.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Pakai anon key -- ini endpoint publik, tidak butuh data sensitif.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    // 1. Tryout terbaru yang publish
    const { data: tryoutRows, error: errTryout } = await supabase
      .from("tryout_publik")
      .select("id, nama")
      .eq("status", "publish")
      .order("created_at", { ascending: false })
      .limit(1);

    if (errTryout) {
      return NextResponse.json({ success: false, message: errTryout.message }, { status: 500 });
    }

    const tryoutTerbaru = tryoutRows?.[0];
    if (!tryoutTerbaru) {
      return NextResponse.json({ success: true, nama_tryout: null, data: [] });
    }

    // 2. Leaderboard untuk tryout itu
    const { data: rows, error: errBoard } = await supabase
      .from("leaderboard_view")
      .select("*")
      .eq("tryout_id", tryoutTerbaru.id)
      .order("nilai", { ascending: false })
      .limit(5);

    if (errBoard) {
      // Jangan bikin landing page error total kalau view-nya belum cocok --
      // cukup kembalikan list kosong + pesan, biar halaman tetap tampil.
      console.error("leaderboard_view error:", errBoard);
      return NextResponse.json({ success: true, nama_tryout: tryoutTerbaru.nama, data: [], warning: errBoard.message });
    }

    const data = (rows || []).map((r: any) => ({
      nama: r.nama || r.nama_peserta || r.nama_user || (r.email ? String(r.email).split("@")[0] : "Peserta"),
      nilai: r.nilai ?? r.nilai_total ?? 0,
      plan: r.plan === "premium" || r.status_akun === "premium" ? "premium" : "gratis",
    }));

    return NextResponse.json({ success: true, nama_tryout: tryoutTerbaru.nama, data });
  } catch (err: any) {
    console.error("leaderboard/terbaru error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}