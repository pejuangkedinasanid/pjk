// FILE: app/api/tryout/akses/route.ts
// GET /api/tryout/akses
//
// PERUBAHAN: email diambil dari session cookie, bukan query string.
// Mencegah siapa pun melihat daftar tryout yang sudah dibuka/dibeli
// user lain hanya dengan mengganti ?email= di URL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveSessionUser } from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { session, blockedByReset } = getActiveSessionUser(req);

    if (blockedByReset) {
      return NextResponse.json(
        { success: false, mustResetPassword: true, message: "Harap ganti password terlebih dahulu." },
        { status: 403 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Sesi tidak valid, silakan login ulang." },
        { status: 401 }
      );
    }

    const email = session.email;

    const { data: aksesRows, error: errAkses } = await supabase
      .from("akses_tryout")
      .select("tryout_id, mode, created_at")
      .eq("email", email)
      .order("created_at", { ascending: false });

    if (errAkses) {
      return NextResponse.json({ success: false, message: errAkses.message }, { status: 500 });
    }

    if (!aksesRows || !aksesRows.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    // ── Dedupe per tryout_id: kalau ada gratis & premium, prioritaskan premium ──
    const dipilihPerTryout = new Map<number | string, any>();
    for (const row of aksesRows) {
      const existing = dipilihPerTryout.get(row.tryout_id);
      if (!existing) {
        dipilihPerTryout.set(row.tryout_id, row);
      } else if (existing.mode !== "premium" && row.mode === "premium") {
        dipilihPerTryout.set(row.tryout_id, row);
      }
    }

    const tryoutIds = Array.from(dipilihPerTryout.keys());

    const { data: tryoutRows, error: errTryout } = await supabase
      .from("tryout")
      .select("id, nama, durasi, jumlah_soal, banner_url, video_url, pdf_url, akses")
      .in("id", tryoutIds);

    if (errTryout) {
      return NextResponse.json({ success: false, message: errTryout.message }, { status: 500 });
    }

    const tryoutMap = new Map((tryoutRows || []).map((t: any) => [t.id, t]));

    const hasil = tryoutIds.map((id) => {
      const akses = dipilihPerTryout.get(id);
      const t = tryoutMap.get(id);
      return {
        tryout_id: id,
        mode: akses.mode, // 'gratis' | 'premium'
        sumber: akses.mode === "premium" ? "kuota" : "password",
        dibuka_at: akses.created_at,
        nama: t?.nama || "Tryout",
        durasi: t?.durasi || null,
        jumlah_soal: t?.jumlah_soal || null,
        banner_url: t?.banner_url || null,
        video_url: t?.video_url || null,
        pdf_url: t?.pdf_url || null,
      };
    });

    hasil.sort((a, b) => new Date(b.dibuka_at).getTime() - new Date(a.dibuka_at).getTime());

    return NextResponse.json({ success: true, data: hasil });
  } catch (err: any) {
    console.error("tryout/akses error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}