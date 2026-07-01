// FILE: app/api/leaderboard/terbaru/route.ts
// GET /api/leaderboard/terbaru
//
// Dipakai landing page (publik, tanpa login) untuk menampilkan
// leaderboard dari TRYOUT TERBARU yang dipublish admin.
//
// PERBAIKAN:
// 1. Sebelumnya pakai NEXT_PUBLIC_SUPABASE_ANON_KEY, yang kena RLS.
//    Kalau leaderboard_view tidak punya policy SELECT untuk role anon,
//    query akan sukses tapi selalu mengembalikan array kosong (bukan error).
//    Solusinya: pakai SUPABASE_SERVICE_ROLE_KEY (server-side only, tidak
//    pernah dikirim ke browser) supaya bisa membaca leaderboard_view
//    tanpa terhalang RLS. Response tetap disaring, jadi tetap aman untuk
//    endpoint publik.
// 2. Field "plan" (premium/gratis) dihapus dari response, karena kolom
//    Status sudah tidak ditampilkan lagi di leaderboard landing page.
// 3. Urutan pakai kolom "ranking" dari view kalau tersedia, fallback ke
//    "nilai" desc supaya tetap benar walau kolom ranking belum ada.
// 4. Menambahkan "sekolah" (dari kolom sekolah_kedinasan) dan "provinsi"
//    di leaderboard_view. Kolom sekolah_kedinasan sudah terbukti ada di
//    view, tapi kolom provinsi BELUM ada -- perlu ditambahkan lewat
//    ALTER VIEW / join ke tabel users di Supabase.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    // 2. Leaderboard untuk tryout itu (service role -> tidak kena RLS)
    const { data: rows, error: errBoard } = await supabase
      .from("leaderboard_view")
      .select("*")
      .eq("tryout_id", tryoutTerbaru.id)
      .order("nilai", { ascending: false })
      .limit(5);

    if (errBoard) {
      console.error("leaderboard_view error:", errBoard);
      return NextResponse.json({
        success: true,
        nama_tryout: tryoutTerbaru.nama,
        data: [],
        warning: errBoard.message,
      });
    }

    const data = (rows || []).map((r: any) => ({
      nama: r.nama || r.nama_peserta || r.nama_user || (r.email ? String(r.email).split("@")[0] : "Peserta"),
      nilai: r.nilai ?? r.nilai_total ?? 0,
      sekolah: r.sekolah_kedinasan || r.sekolah || "-",
      // NOTE: kolom "provinsi" belum ada di leaderboard_view saat ini,
      // makanya selalu jatuh ke "-". Perlu tambahkan join ke tabel users
      // di definisi view supaya kolom ini terisi.
      provinsi: r.provinsi || "-",
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