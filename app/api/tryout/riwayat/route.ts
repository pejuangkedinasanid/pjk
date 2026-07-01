// FILE: app/api/tryout/riwayat/route.ts
// GET /api/tryout/riwayat
//
// PERUBAHAN: email diambil dari session cookie, bukan query string.
// Ini mencegah siapa pun melihat riwayat nilai tryout milik user lain
// hanya dengan mengganti nilai ?email= di URL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/session";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const session = getSessionUser(req);

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Sesi tidak valid, silakan login ulang." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("hasil_tryout")
      .select("id, tryout_id, nama_tryout, nilai, nilai_twk, nilai_tiu, nilai_tkp, durasi_menit, mode, selesai, is_first_attempt, created_at")
      .eq("email", session.email)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("tryout/riwayat error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}