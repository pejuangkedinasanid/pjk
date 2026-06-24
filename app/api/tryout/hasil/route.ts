// FILE: app/api/tryout/hasil/route.ts
// GET /api/tryout/hasil?email=...&tryout_id=...&hasil_id=...(opsional)
//
// Mengambil satu baris hasil_tryout (default: percobaan terakhir untuk
// email+tryout_id, atau baris spesifik kalau hasil_id dikirim), lalu
// menggabungkannya dengan passing_twk/tiu/tkp & pdf_url dari tabel tryout.
//
// PENTING: akses_pembahasan dihitung di server dari kolom
// hasil_tryout.mode (mode yang BENAR-BENAR dipakai saat user
// mengerjakan/submit, bukan dari query string), jadi tidak bisa
// dimanipulasi dengan mengubah URL.

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
    const tryoutId = searchParams.get("tryout_id");
    const hasilId = searchParams.get("hasil_id");

    if (!email || !tryoutId) {
      return NextResponse.json(
        { success: false, message: "email dan tryout_id wajib diisi." },
        { status: 400 }
      );
    }

    // ── 1. Ambil baris hasil_tryout ──
    let hasilRow: any = null;

    if (hasilId) {
      const { data, error } = await supabase
        .from("hasil_tryout")
        .select("*")
        .eq("id", hasilId)
        .eq("email", email)
        .eq("tryout_id", tryoutId)
        .maybeSingle();
      if (error) throw error;
      hasilRow = data;
    } else {
      const { data, error } = await supabase
        .from("hasil_tryout")
        .select("*")
        .eq("email", email)
        .eq("tryout_id", tryoutId)
        .eq("selesai", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      hasilRow = data;
    }

    if (!hasilRow) {
      return NextResponse.json(
        { success: false, message: "Hasil tryout tidak ditemukan." },
        { status: 404 }
      );
    }

    // ── 2. Ambil info tryout (passing grade & link PDF pembahasan) ──
    const { data: tryoutRow, error: errTryout } = await supabase
      .from("tryout")
      .select("nama, passing_twk, passing_tiu, passing_tkp, pdf_url")
      .eq("id", tryoutId)
      .maybeSingle();

    if (errTryout) throw errTryout;

    // ── 3. Akses pembahasan = mode yang dipakai SAAT mengerjakan ──
    const aksesPembahasan = hasilRow.mode === "premium";

    return NextResponse.json({
      success: true,
      data: {
        hasil_id: hasilRow.id,
        nama: tryoutRow?.nama || hasilRow.nama_tryout || "Tryout",
        mode: hasilRow.mode,
        nilai_total: hasilRow.nilai,
        nilai_twk: hasilRow.nilai_twk,
        nilai_tiu: hasilRow.nilai_tiu,
        nilai_tkp: hasilRow.nilai_tkp,
        pg_twk: tryoutRow?.passing_twk ?? null,
        pg_tiu: tryoutRow?.passing_tiu ?? null,
        pg_tkp: tryoutRow?.passing_tkp ?? null,
        akses_pembahasan: aksesPembahasan,
        pembahasan_pdf_url: tryoutRow?.pdf_url || null,
        durasi_menit: hasilRow.durasi_menit,
        is_first_attempt: hasilRow.is_first_attempt,
        created_at: hasilRow.created_at,
      },
    });
  } catch (err: any) {
    console.error("tryout/hasil error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}