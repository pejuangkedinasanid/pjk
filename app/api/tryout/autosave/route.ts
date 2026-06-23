// FILE: app/api/tryout/autosave/route.ts
// POST /api/tryout/autosave
// Body: { email, tryout_id, mode, jawaban_cache, raguan_cache, sisa_detik }
//
// Dipanggil berkala (tiap 15 detik) dari kerjakan-tryout.html supaya
// kalau tab ditutup / koneksi putus, progres tidak hilang total.
// Upsert ke sesi_tryout berdasarkan UNIQUE(email, tryout_id).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, tryout_id, mode, jawaban_cache, raguan_cache, sisa_detik } = await req.json();

    if (!email || !tryout_id) {
      return NextResponse.json(
        { success: false, message: "email dan tryout_id wajib diisi." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("sesi_tryout")
      .upsert(
        {
          email,
          tryout_id,
          mode: mode || "gratis",
          jawaban_cache: jawaban_cache || {},
          raguan_cache: raguan_cache || [],
          sisa_detik: sisa_detik ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email,tryout_id" }
      );

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("tryout/autosave error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}