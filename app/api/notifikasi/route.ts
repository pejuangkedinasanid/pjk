// FILE: app/api/notifikasi/terbaru/route.ts
// GET /api/notifikasi/terbaru
//
// Notifikasi terbaru (broadcast dari admin) untuk ditampilkan di
// dashboard.html. Dipindah ke server (service role) karena query
// langsung "sb.from('notifikasi')" dari browser kemungkinan kena RLS.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("notifikasi")
      .select("pesan, target, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("notifikasi/terbaru error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}