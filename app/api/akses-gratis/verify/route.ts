// FILE: app/api/akses-gratis/verify/route.ts
// POST /api/akses-gratis/verify
// Body: { tryout_id, email, password }
//
// PERBAIKAN: sekarang mendukung 2 mekanisme password sekaligus:
//   1. Password BERSAMA — admin set langsung di kolom
//      tryout.password_akses lewat admin-tryout.html (satu
//      password berlaku untuk SEMUA user yang gratis).
//   2. Password PER-USER — admin keluarkan lewat tabel
//      akses_gratis setelah user mengisi formulir (gform_url),
//      seperti yang sudah dibangun sebelumnya.
//
// Verifikasi mencoba opsi 1 dulu, kalau tidak cocok baru cek opsi 2.
// Password ASLI tidak pernah dikirim ke frontend di kedua jalur ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { tryout_id, email, password } = await req.json();

    if (!tryout_id || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    // ── 1. Cek password BERSAMA di tabel tryout ──
    const { data: tryoutRow } = await supabase
      .from("tryout")
      .select("password_akses")
      .eq("id", tryout_id)
      .single();

    if (
      tryoutRow &&
      tryoutRow.password_akses &&
      tryoutRow.password_akses.trim() === password.trim()
    ) {
      return NextResponse.json({ success: true, message: "Akses diberikan (password bersama)." });
    }

    // ── 2. Kalau tidak cocok, cek password PER-USER di akses_gratis ──
    const { data: aksesRow, error: errAkses } = await supabase
      .from("akses_gratis")
      .select("password_akses, status")
      .eq("tryout_id", tryout_id)
      .eq("email", email)
      .maybeSingle();

    if (!aksesRow) {
      return NextResponse.json(
        { success: false, message: "Password salah, atau kamu belum memiliki akses untuk tryout ini." },
        { status: 404 }
      );
    }

    if (aksesRow.status !== "aktif") {
      return NextResponse.json(
        { success: false, message: "Akses kamu belum aktif. Hubungi admin." },
        { status: 403 }
      );
    }

    if (aksesRow.password_akses !== password.trim()) {
      return NextResponse.json(
        { success: false, message: "Password salah. Silakan coba lagi." },
        { status: 401 }
      );
    }

    return NextResponse.json({ success: true, message: "Akses diberikan (password per-user)." });
  } catch (err) {
    console.error("akses-gratis/verify error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}