// FILE: app/api/tryout/submit/route.ts
// POST /api/tryout/submit
// Body: {
//   email, tryout_id, mode ('gratis'|'premium'), durasi_menit,
//   jawaban: { [soal_id]: "A".."E" }
// }
//
// PERBAIKAN dari versi sebelumnya:
// 1. Hanya PERCOBAAN PERTAMA (per email+tryout_id) yang ditandai
//    is_first_attempt=true — leaderboard_view hanya membaca yang ini.
//    Percobaan ke-2, ke-3, dst tetap disimpan (untuk analisis
//    perkembangan & latihan ulang) tapi tidak masuk leaderboard.
// 2. Response sekarang menyertakan array "review" lengkap per soal
//    (opsi + jawaban benar + jawaban user + pembahasan) supaya
//    halaman hasil bisa langsung render tanpa fetch tambahan.
//    Pembahasan HANYA disertakan kalau mode === 'premium'.

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

    // ── 1. Ambil semua soal ASLI (lengkap dengan benar/bobot/pembahasan) ──
    const { data: soalList, error: errSoal } = await supabase
      .from("soal")
      .select("id, nomor, seksi, teks, gambar_url, opsi, bobot_benar, pembahasan")
      .eq("tryout_id", tryout_id)
      .order("nomor", { ascending: true });

    if (errSoal || !soalList) {
      return NextResponse.json(
        { success: false, message: errSoal?.message || "Gagal memuat soal." },
        { status: 500 }
      );
    }

    const { data: tryoutRow } = await supabase
      .from("tryout")
      .select("nama")
      .eq("id", tryout_id)
      .single();

    const jawabanMap = jawaban || {};
    const isPremiumMode = mode === "premium";

    let nilaiTwk = 0, nilaiTiu = 0, nilaiTkp = 0;
    const detailRows: any[] = [];
    const review: any[] = [];

    for (const soal of soalList) {
      const hurufDipilih = jawabanMap[soal.id] || null;
      const opsiDipilih = (soal.opsi || []).find((o: any) => o.huruf === hurufDipilih);

      let poin = 0;
      let benar: boolean | null = null;

      if (soal.seksi === "TKP") {
        poin = opsiDipilih ? (opsiDipilih.bobot || 0) : 0;
        benar = null;
        nilaiTkp += poin;
      } else {
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

      // ── Data review untuk ditampilkan di halaman hasil ──
      review.push({
        id: soal.id,
        nomor: soal.nomor,
        seksi: soal.seksi,
        teks: soal.teks,
        gambar_url: soal.gambar_url,
        opsi: soal.opsi, // sudah aman dikirim, ujian sudah selesai
        jawaban_user: hurufDipilih,
        poin,
        benar,
        // Pembahasan HANYA dikirim untuk mode premium
        pembahasan: isPremiumMode ? (soal.pembahasan || null) : null,
      });
    }

    const nilaiTotal = nilaiTwk + nilaiTiu + nilaiTkp;

    // ── 2. Cek apakah ini percobaan PERTAMA user untuk tryout ini ──
    const { count: jumlahPercobaanSebelumnya } = await supabase
      .from("hasil_tryout")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("tryout_id", tryout_id)
      .eq("selesai", true);

    const isFirstAttempt = (jumlahPercobaanSebelumnya || 0) === 0;

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
        is_first_attempt: isFirstAttempt,
      })
      .select()
      .single();

    if (errHasil) {
      return NextResponse.json({ success: false, message: errHasil.message }, { status: 500 });
    }

    // ── 4. Simpan detail jawaban per soal ──
    const detailWithHasilId = detailRows.map((d) => ({ ...d, hasil_id: hasilRow.id }));
    await supabase.from("detail_jawaban").insert(detailWithHasilId);

    // ── 5. Tandai sesi_tryout selesai ──
    await supabase
      .from("sesi_tryout")
      .update({ selesai: true, selesai_at: new Date().toISOString() })
      .eq("email", email)
      .eq("tryout_id", tryout_id);

    // ── 6. Hitung ringkasan TWK/TIU (jumlah benar dari total soal) ──
    const totalTwk = soalList.filter((s) => s.seksi === "TWK").length;
    const totalTiu = soalList.filter((s) => s.seksi === "TIU").length;
    const totalTkp = soalList.filter((s) => s.seksi === "TKP").length;
    const benarTwk = review.filter((r) => r.seksi === "TWK" && r.benar === true).length;
    const benarTiu = review.filter((r) => r.seksi === "TIU" && r.benar === true).length;

    return NextResponse.json({
      success: true,
      hasil_id: hasilRow.id,
      is_first_attempt: isFirstAttempt,
      nilai: nilaiTotal,
      nilai_twk: nilaiTwk,
      nilai_tiu: nilaiTiu,
      nilai_tkp: nilaiTkp,
      total_twk: totalTwk,
      total_tiu: totalTiu,
      total_tkp: totalTkp,
      benar_twk: benarTwk,
      benar_tiu: benarTiu,
      review,
    });
  } catch (err) {
    console.error("tryout/submit error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}