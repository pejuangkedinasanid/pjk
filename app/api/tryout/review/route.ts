// FILE: app/api/tryout/review/route.ts
// GET /api/tryout/review?email=...&tryout_id=...&hasil_id=...(opsional)
//
// Mengambil semua soal sebuah tryout, digabung dengan jawaban user yang
// tersimpan di detail_jawaban untuk percobaan terkait, lalu menyusun
// payload yang aman untuk ditampilkan di halaman review:
//
// - TWK / TIU : dikirim jawaban_benar (huruf opsi yang benar) + status
//               benar/salah, karena pengguna gratis BOLEH tahu kunci
//               jawabannya (sesuai requirement), hanya pembahasan
//               (teks penjelasan) yang dikunci.
// - TKP       : tidak ada "jawaban benar" (skornya berbasis bobot per
//               opsi), jadi yang dikirim adalah poin yang didapat dari
//               opsi yang dipilih.
//
// "pembahasan" HANYA disertakan kalau hasil_tryout.mode === 'premium'
// untuk percobaan tersebut (akses_pembahasan), ditentukan di server —
// bukan dari query string — supaya tidak bisa dimanipulasi dari klien.

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

    // ── 1. Ambil baris hasil_tryout (untuk tahu mode & hasil_id pasti) ──
    let hasilRow: any = null;

    if (hasilId) {
      const { data, error } = await supabase
        .from("hasil_tryout")
        .select("id, mode")
        .eq("id", hasilId)
        .eq("email", email)
        .eq("tryout_id", tryoutId)
        .maybeSingle();
      if (error) throw error;
      hasilRow = data;
    } else {
      const { data, error } = await supabase
        .from("hasil_tryout")
        .select("id, mode")
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

    const aksesPembahasan = hasilRow.mode === "premium";

    // ── 2. Ambil nama tryout ──
    const { data: tryoutRow } = await supabase
      .from("tryout")
      .select("nama")
      .eq("id", tryoutId)
      .maybeSingle();

    // ── 3. Ambil semua soal ──
    const { data: soalList, error: errSoal } = await supabase
      .from("soal")
      .select("id, nomor, seksi, teks, gambar_url, opsi, bobot_benar, pembahasan")
      .eq("tryout_id", tryoutId)
      .order("nomor", { ascending: true });

    if (errSoal || !soalList) {
      return NextResponse.json(
        { success: false, message: errSoal?.message || "Gagal memuat soal." },
        { status: 500 }
      );
    }

    // ── 4. Ambil jawaban user untuk percobaan ini ──
    const { data: jawabanRows, error: errJawaban } = await supabase
      .from("detail_jawaban")
      .select("soal_id, jawaban, benar")
      .eq("hasil_id", hasilRow.id);

    if (errJawaban) throw errJawaban;

    const jawabanMap: Record<string, { jawaban: string | null; benar: boolean | null }> = {};
    (jawabanRows || []).forEach((j: any) => {
      jawabanMap[j.soal_id] = { jawaban: j.jawaban, benar: j.benar };
    });

    // ── 5. Susun payload review per soal ──
    const soalReview = soalList.map((soal: any) => {
      const jawabanUser = jawabanMap[soal.id]?.jawaban ?? null;
      const opsiDipilih = (soal.opsi || []).find((o: any) => o.huruf === jawabanUser);

      const base = {
        id: soal.id,
        nomor: soal.nomor,
        seksi: soal.seksi,
        teks: soal.teks,
        gambar_url: soal.gambar_url,
        opsi: (soal.opsi || []).map((o: any) => ({
          huruf: o.huruf,
          teks: o.teks,
          benar: soal.seksi === "TKP" ? undefined : !!o.benar,
          bobot: soal.seksi === "TKP" ? o.bobot ?? 0 : undefined,
        })),
        jawaban_user: jawabanUser,
        pembahasan: aksesPembahasan ? soal.pembahasan || null : null,
      };

      if (soal.seksi === "TKP") {
        return {
          ...base,
          jawaban_benar: null,
          poin: opsiDipilih ? opsiDipilih.bobot || 0 : 0,
        };
      }

      const opsiBenar = (soal.opsi || []).find((o: any) => o.benar === true);
      const benar = jawabanMap[soal.id]?.benar ?? null;
      const poin = benar ? (soal.bobot_benar || 1) * 5 : 0;

      return {
        ...base,
        jawaban_benar: opsiBenar?.huruf ?? null,
        benar,
        poin,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        hasil_id: hasilRow.id,
        nama: tryoutRow?.nama || "Tryout",
        akses_pembahasan: aksesPembahasan,
        soal: soalReview,
      },
    });
  } catch (err: any) {
    console.error("tryout/review error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}