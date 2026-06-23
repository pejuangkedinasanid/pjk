// FILE: app/api/tryout/submit/route.ts
// POST /api/tryout/submit
// Body: {
//   email, tryout_id, mode ('gratis'|'premium'), durasi_menit,
//   jawaban: { [soal_id]: "A".."E" }   // soal yang tidak terjawab boleh diabaikan / null
// }
//
// Ini "mesin penilaian" yang menjawab kebutuhan utama: dari SATU
// tabel "soal" yang sama dipakai admin & peserta, sistem otomatis
// tahu mana jawaban benar/salah (TWK/TIU) dan berapa poin TKP,
// lalu menyimpan ke hasil_tryout + detail_jawaban (utk leaderboard
// & analisis_soal_view yang sudah ada di migration kamu).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, tryout_id, mode, durasi_menit, jawaban } = await req.json();

    if (!email || !tryout_id) {
      return NextResponse.json(
        { success: false, message: "email dan tryout_id wajib diisi." },
        { status: 400 }
      );
    }

    // ── 1. Ambil semua soal ASLI (lengkap dengan benar/bobot) — server-side saja ──
    const { data: soalList, error: errSoal } = await supabase
      .from("soal")
      .select("id, nomor, seksi, opsi, bobot_benar")
      .eq("tryout_id", tryout_id);

    if (errSoal || !soalList) {
      return NextResponse.json(
        { success: false, message: errSoal?.message || "Gagal memuat soal." },
        { status: 500 }
      );
    }

    // ── 2. Ambil nama tryout untuk snapshot di hasil_tryout ──
    const { data: tryoutRow } = await supabase
      .from("tryout")
      .select("nama")
      .eq("id", tryout_id)
      .single();

    const jawabanMap = jawaban || {};

    let nilaiTwk = 0, nilaiTiu = 0, nilaiTkp = 0;
    const detailRows: any[] = [];

    for (const soal of soalList) {
      const hurufDipilih = jawabanMap[soal.id] || null;
      const opsiDipilih = (soal.opsi || []).find((o: any) => o.huruf === hurufDipilih);

      let poin = 0;
      let benar: boolean | null = null;

      if (soal.seksi === "TKP") {
        // TKP: tidak ada "benar/salah", poin langsung dari bobot opsi yang dipilih
        poin = opsiDipilih ? (opsiDipilih.bobot || 0) : 0;
        benar = null;
        nilaiTkp += poin;
      } else {
        // TWK / TIU: benar = 5 x bobot_benar, salah/skip = 0
        benar = !!(opsiDipilih && opsiDipilih.benar === true);
        poin = benar ? (soal.bobot_benar || 1) * 5 : 0;
        if (soal.seksi === "TWK") nilaiTwk += poin;
        else nilaiTiu += poin;
      }

      detailRows.push({
        soal_id: soal.id,
        tryout_id,
        email,
        jawaban: hurufDipilih,
        benar,
        seksi: soal.seksi,
      });
    }

    const nilaiTotal = nilaiTwk + nilaiTiu + nilaiTkp;

    // ── 3. Simpan ke hasil_tryout ──
    const { data: hasilRow, error: errHasil } = await supabase
      .from("hasil_tryout")
      .insert({
        email,
        tryout_id,
        nama_tryout: tryoutRow?.nama || null,
        nilai: nilaiTotal,
        nilai_twk: nilaiTwk,
        nilai_tiu: nilaiTiu,
        nilai_tkp: nilaiTkp,
        durasi_menit: durasi_menit || null,
        mode: mode || "gratis",
        selesai: true,
      })
      .select()
      .single();

    if (errHasil) {
      return NextResponse.json({ success: false, message: errHasil.message }, { status: 500 });
    }

    // ── 4. Simpan detail jawaban per soal (untuk review & analisis_soal_view) ──
    const detailWithHasilId = detailRows.map((d) => ({ ...d, hasil_id: hasilRow.id }));
    await supabase.from("detail_jawaban").insert(detailWithHasilId);

    // ── 5. Tandai sesi_tryout selesai (kalau ada) ──
    await supabase
      .from("sesi_tryout")
      .update({ selesai: true, selesai_at: new Date().toISOString() })
      .eq("email", email)
      .eq("tryout_id", tryout_id);

    return NextResponse.json({
      success: true,
      hasil_id: hasilRow.id,
      nilai: nilaiTotal,
      nilai_twk: nilaiTwk,
      nilai_tiu: nilaiTiu,
      nilai_tkp: nilaiTkp,
    });
  } catch (err) {
    console.error("tryout/submit error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}