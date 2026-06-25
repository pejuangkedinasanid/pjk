// FILE: app/api/analisis/detail/route.ts
// GET /api/analisis/detail?email=...&tryout_id=...   (satu tryout tertentu)
// GET /api/analisis/detail?email=...&tryout_id=semua (gabungan semua tryout premium)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function persen(benar: number, total: number) {
  return total > 0 ? Math.round((benar / total) * 100) : 0;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email        = searchParams.get("email");
    const tryoutIdParam = searchParams.get("tryout_id");

    if (!email || !tryoutIdParam) {
      return NextResponse.json(
        { success: false, message: "email dan tryout_id wajib diisi." },
        { status: 400 }
      );
    }

    // ── 1. Ambil semua percobaan PREMIUM yang selesai milik user ──
    const { data: premiumRows, error: errPremium } = await supabase
      .from("hasil_tryout")
      .select(
        "id, tryout_id, nama_tryout, nilai, nilai_twk, nilai_tiu, nilai_tkp, durasi_menit, is_first_attempt, created_at"
      )
      .eq("email", email)
      .eq("mode", "premium")
      .eq("selesai", true)
      .order("created_at", { ascending: true });

    if (errPremium) {
      return NextResponse.json({ success: false, message: errPremium.message }, { status: 500 });
    }

    if (!premiumRows || !premiumRows.length) {
      return NextResponse.json(
        { success: false, message: "Belum ada tryout yang diselesaikan secara premium." },
        { status: 404 }
      );
    }

    // ── 2. Filter sesuai tryout_id yang diminta ──
    let attempts: any[];
    let namaAnalisis: string;

    if (tryoutIdParam === "semua") {
      attempts     = premiumRows;
      namaAnalisis = "Gabungan Semua Tryout Premium";
    } else {
      const targetId = parseInt(tryoutIdParam);
      attempts = premiumRows.filter((r) => r.tryout_id === targetId);
      if (!attempts.length) {
        return NextResponse.json(
          { success: false, message: "Tryout ini belum pernah diselesaikan secara premium." },
          { status: 403 }
        );
      }
      namaAnalisis = attempts[0].nama_tryout || "Tryout";
    }

    const hasilIds = attempts.map((a) => a.id);

    // ── 3. Ambil semua baris detail_jawaban ──
    // Kolom: id, hasil_id, soal_id, tryout_id, email, jawaban, benar, seksi, created_at
    const { data: jawabanRows, error: errJawaban } = await supabase
      .from("detail_jawaban")
      .select("soal_id, jawaban, benar, seksi, hasil_id")
      .in("hasil_id", hasilIds);

    if (errJawaban) {
      return NextResponse.json({ success: false, message: errJawaban.message }, { status: 500 });
    }

    // ── 4. Ambil data soal (untuk aspek & opsi TKP) ──
    const soalIds = Array.from(
      new Set((jawabanRows || []).map((j: any) => j.soal_id))
    );

    let soalMap = new Map<number, any>();
    if (soalIds.length) {
      const { data: soalRows, error: errSoal } = await supabase
        .from("soal")
        .select("id, seksi, aspek, opsi")
        .in("id", soalIds);

      if (errSoal) {
        return NextResponse.json({ success: false, message: errSoal.message }, { status: 500 });
      }
      soalMap = new Map((soalRows || []).map((s: any) => [s.id, s]));
    }

    // ── 5. Hitung rekap per SEKSI & per ASPEK ──
    type Akum = { benar: number; total: number; poinTkp: number; jumlahTkp: number };

    const perSeksi: Record<string, Akum> = {
      TWK: { benar: 0, total: 0, poinTkp: 0, jumlahTkp: 0 },
      TIU: { benar: 0, total: 0, poinTkp: 0, jumlahTkp: 0 },
      TKP: { benar: 0, total: 0, poinTkp: 0, jumlahTkp: 0 },
    };
    const perAspekMap = new Map<
      string,
      Akum & { seksi: string; aspek: string }
    >();

    (jawabanRows || []).forEach((j: any) => {
      const soal  = soalMap.get(j.soal_id);
      // Gunakan seksi dari detail_jawaban (sudah disimpan saat submit),
      // fallback ke data soal kalau kosong
      const seksi = (j.seksi || soal?.seksi || "Lainnya").toUpperCase();
      const aspek = soal?.aspek || "Belum Dikategorikan";
      const key   = seksi + "::" + aspek;

      if (!perAspekMap.has(key)) {
        perAspekMap.set(key, {
          seksi,
          aspek,
          benar: 0,
          total: 0,
          poinTkp: 0,
          jumlahTkp: 0,
        });
      }

      const akA = perAspekMap.get(key)!;
      const akS = perSeksi[seksi] ?? (perSeksi[seksi] = { benar: 0, total: 0, poinTkp: 0, jumlahTkp: 0 });

      if (seksi === "TKP") {
        // TKP: hitung bobot dari opsi yang dipilih.
        // Kalau jawaban NULL (tidak dijawab) → poin 0.
        const opsiDipilih = j.jawaban
          ? (soal?.opsi || []).find((o: any) => o.huruf === j.jawaban)
          : null;
        const poin = opsiDipilih ? (opsiDipilih.bobot ?? 0) : 0;

        akS.poinTkp  += poin;
        akS.jumlahTkp += 1;
        akA.poinTkp  += poin;
        akA.jumlahTkp += 1;
      } else {
        // TWK / TIU: benar = TRUE dihitung benar, selain itu salah.
        // NULL (tidak dijawab) dianggap salah → tidak perlu kondisi khusus.
        akS.total += 1;
        akA.total += 1;
        if (j.benar === true) {
          akS.benar += 1;
          akA.benar += 1;
        }
      }
    });

    // ── 6. Bentuk output ringkasan seksi ──
    // TWK/TIU → persentase benar (0-100)
    // TKP     → rata-rata bobot × 20 supaya skala 1-5 jadi 20-100
    const ringkasanSeksi = ["TWK", "TIU", "TKP"].map((seksi) => {
      const a = perSeksi[seksi] || { benar: 0, total: 0, poinTkp: 0, jumlahTkp: 0 };
      if (seksi === "TKP") {
        const skor = a.jumlahTkp
          ? Math.round((a.poinTkp / a.jumlahTkp) * 20)
          : 0;
        return { seksi, skor, satuan: "rata-rata poin ×20" };
      }
      return { seksi, skor: persen(a.benar, a.total), satuan: "% benar" };
    });

    // ── 7. Rincian per aspek ──
    const rincianAspek = Array.from(perAspekMap.values())
      .map((a) => {
        const skor =
          a.seksi === "TKP"
            ? a.jumlahTkp
              ? Math.round((a.poinTkp / a.jumlahTkp) * 20)
              : 0
            : persen(a.benar, a.total);
        const jumlah_soal = a.seksi === "TKP" ? a.jumlahTkp : a.total;
        return { seksi: a.seksi, aspek: a.aspek, skor, jumlah_soal };
      })
      // Hanya tampilkan aspek yang punya minimal 1 soal
      .filter((a) => a.jumlah_soal > 0)
      .sort((x, y) => x.skor - y.skor);

    // ── 8. Rekomendasi: 3 terlemah & 2 terkuat ──
    const terlemah = rincianAspek.slice(0, 3);
    const terkuat  = [...rincianAspek].sort((x, y) => y.skor - x.skor).slice(0, 2);

    // ── 9. Grafik perkembangan nilai per percobaan ──
    const grafik = attempts.map((a, idx) => ({
      percobaan_ke : idx + 1,
      nama_tryout  : a.nama_tryout,
      nilai        : a.nilai        ?? 0,
      nilai_twk    : a.nilai_twk    ?? 0,
      nilai_tiu    : a.nilai_tiu    ?? 0,
      nilai_tkp    : a.nilai_tkp    ?? 0,
      tanggal      : a.created_at,
      is_first_attempt: a.is_first_attempt,
    }));

    // ── 10. Ringkasan progres keseluruhan ──
    const semuaNilai = attempts.map((a) => a.nilai ?? 0);
    const ringkasanProgres = {
      total_percobaan : attempts.length,
      nilai_pertama   : semuaNilai[0] ?? 0,
      nilai_terbaru   : semuaNilai[semuaNilai.length - 1] ?? 0,
      nilai_tertinggi : Math.max(...semuaNilai),
      nilai_terendah  : Math.min(...semuaNilai),
      rata_rata       : Math.round(
        semuaNilai.reduce((s, n) => s + n, 0) / semuaNilai.length
      ),
    };

    return NextResponse.json({
      success          : true,
      nama_analisis    : namaAnalisis,
      ringkasan_progres: ringkasanProgres,
      grafik,
      ringkasan_seksi  : ringkasanSeksi,
      rincian_aspek    : rincianAspek,
      rekomendasi      : { terlemah, terkuat },
    });

  } catch (err: any) {
    console.error("analisis/detail error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}