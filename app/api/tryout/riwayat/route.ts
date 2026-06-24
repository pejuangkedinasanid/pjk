// FILE: app/api/tryout/riwayat/route.ts
// GET /api/tryout/riwayat?email=...
//
// Mengambil seluruh riwayat hasil_tryout milik satu user (semua
// percobaan, bukan cuma yang is_first_attempt), diurutkan dari yang
// terbaru. Dipakai tryout-saya.html untuk menentukan status
// "Selesai" / "Belum Dikerjakan" per tryout dan menampilkan nilai
// percobaan terbaru.
//
// Dipindah ke server (service role) karena query ini sebelumnya
// dilakukan langsung dari browser pakai anon key, yang kemungkinan
// kena RLS (hasil_tryout berisi data per-user yang sensitif).

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

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("hasil_tryout")
      .select("id, tryout_id, nilai, nilai_twk, nilai_tiu, nilai_tkp, mode, selesai, is_first_attempt, created_at")
      .eq("email", email)
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