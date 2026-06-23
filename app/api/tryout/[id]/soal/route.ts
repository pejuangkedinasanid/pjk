// FILE: app/api/tryout/[id]/soal/route.ts
// GET /api/tryout/[id]/soal
//
// Dipakai HALAMAN PESERTA saat sedang MENGERJAKAN tryout.
// PENTING: endpoint ini SENGAJA tidak pernah mengirim field
// "benar" atau "bobot" di dalam opsi, dan tidak pernah mengirim
// "pembahasan" — supaya peserta tidak bisa "curi lihat" jawaban
// lewat Network tab di browser selagi masih mengerjakan.
//
// Pembahasan & hasil benar/salah baru dikirim lewat endpoint
// terpisah SETELAH submit (lihat /api/tryout/submit dan, kalau
// sudah dibuat, /api/tryout/hasil-detail).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tryoutId = params.id;

  const { data, error } = await supabase
    .from("soal")
    .select("id, nomor, seksi, teks, gambar_url, opsi")
    .eq("tryout_id", tryoutId)
    .order("nomor", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  // Strip "benar" / "bobot" dari setiap opsi sebelum dikirim ke browser
  const sanitized = (data || []).map((row) => ({
    id: row.id,
    nomor: row.nomor,
    seksi: row.seksi,
    teks: row.teks,
    gambar_url: row.gambar_url,
    opsi: (row.opsi || []).map((o: any) => ({ huruf: o.huruf, teks: o.teks })),
  }));

  return NextResponse.json({ success: true, data: sanitized, total: sanitized.length });
}