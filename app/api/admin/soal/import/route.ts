// FILE: app/api/admin/soal/import/route.ts
// POST /api/admin/soal/import
// Body: { tryout_id, soal: [ {...}, {...} ] }
//
// Format tiap item (yang ditulis admin, format "friendly"):
// {
//   "kategori": "TWK" | "TIU" | "TKP",
//   "pertanyaan": "...",
//   "gambar_url": "..." (opsional),
//   "opsi": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
//   "jawaban_benar": "A".."E"   (wajib utk TWK/TIU)
//   "bobot": 1                  (opsional utk TWK/TIU, default 1)
//   "poin": { "A":1, ..., "E":5 } (wajib utk TKP, nilai 1-5)
//   "pembahasan": "..." (opsional)
// }
//
// Diterjemahkan & disimpan ke kolom "opsi" (JSONB array) sesuai
// skema tabel soal yang sebenarnya:
//   TWK/TIU -> [{huruf,teks,benar}, ...]
//   TKP     -> [{huruf,teks,bobot}, ...]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin(email: string | null) {
  if (!email) return false;
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .single();
  if (error || !data) return false;
  return data.role === "admin" || data.role === "super_admin";
}

const HURUF = ["A", "B", "C", "D", "E"];

export async function POST(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");
  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Hanya admin." }, { status: 403 });
  }

  try {
    const { tryout_id, soal } = await req.json();

    if (!tryout_id) {
      return NextResponse.json({ success: false, message: "tryout_id wajib diisi." }, { status: 400 });
    }
    if (!Array.isArray(soal) || !soal.length) {
      return NextResponse.json(
        { success: false, message: "Data soal harus berupa array dan tidak boleh kosong." },
        { status: 400 }
      );
    }

    // Nomor lanjut dari nomor terbesar yang sudah ada (global per tryout)
    const { data: existing } = await supabase
      .from("soal")
      .select("nomor")
      .eq("tryout_id", tryout_id)
      .order("nomor", { ascending: false })
      .limit(1);

    let nextNomor = (existing && existing[0]?.nomor ? existing[0].nomor : 0) + 1;

    const rowsToInsert: any[] = [];
    const errors: string[] = [];

    soal.forEach((item: any, idx: number) => {
      const seksi = (item.kategori || item.seksi || "").toUpperCase();

      if (!["TWK", "TIU", "TKP"].includes(seksi)) {
        errors.push(`Baris ${idx + 1}: kategori tidak valid ("${item.kategori}").`);
        return;
      }
      const teks = item.pertanyaan || item.teks;
      if (!teks) {
        errors.push(`Baris ${idx + 1}: pertanyaan kosong.`);
        return;
      }
      if (!item.opsi || HURUF.some((h) => !item.opsi[h])) {
        errors.push(`Baris ${idx + 1}: opsi A-E harus lengkap.`);
        return;
      }

      let opsiArray: any[];

      if (seksi === "TKP") {
        const poin = item.poin || {};
        const vals = HURUF.map((h) => poin[h]);
        if (vals.some((v) => v === undefined || v === null || v < 1 || v > 5)) {
          errors.push(`Baris ${idx + 1}: kategori TKP wajib isi "poin" A-E dengan angka 1-5.`);
          return;
        }
        opsiArray = HURUF.map((h) => ({ huruf: h, teks: item.opsi[h], bobot: poin[h] }));
      } else {
        const jb = (item.jawaban_benar || "").toUpperCase();
        if (!HURUF.includes(jb)) {
          errors.push(`Baris ${idx + 1}: kategori ${seksi} wajib isi "jawaban_benar" (A-E).`);
          return;
        }
        opsiArray = HURUF.map((h) => ({ huruf: h, teks: item.opsi[h], benar: h === jb }));
      }

      rowsToInsert.push({
        tryout_id,
        seksi,
        nomor: nextNomor++,
        teks,
        opsi: opsiArray,
        bobot_benar: 1,
        gambar_url: item.gambar_url || null,
        pembahasan: item.pembahasan || null,
      });
    });

    if (!rowsToInsert.length) {
      return NextResponse.json(
        { success: false, message: "Tidak ada soal valid untuk diimpor.", errors },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.from("soal").insert(rowsToInsert).select();

    if (error) {
      return NextResponse.json({ success: false, message: error.message, errors }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      inserted: data?.length || 0,
      errors,
    });
  } catch (err) {
    console.error("admin/soal/import error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan server." }, { status: 500 });
  }
}