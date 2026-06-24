// FILE: app/api/admin/users/route.ts
// GET /api/admin/users?q=...&plan=...&limit=...&offset=...
//
// Daftar seluruh user yang sudah mendaftar, untuk halaman admin-users.html.
// - q     : cari berdasarkan nama ATAU email (ilike, case-insensitive)
// - plan  : "gratis" | "premium" (opsional, default semua)
// - limit : default 50
// - offset: default 0
//
// Memakai service role key karena ini halaman admin (perlu baca semua
// baris user tanpa terhalang RLS).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q      = (searchParams.get("q") || "").trim();
    const plan   = searchParams.get("plan"); // "gratis" | "premium" | null
    const limit  = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = supabase
      .from("users")
      .select("id, nama, email, plan, kuota_tryout, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      // Cari di kolom nama ATAU email sekaligus
      query = query.or(`nama.ilike.%${q}%,email.ilike.%${q}%`);
    }

    if (plan === "gratis") {
      query = query.eq("plan", "free");
    } else if (plan === "premium") {
      query = query.eq("plan", "premium");
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      total: count ?? (data || []).length,
      limit,
      offset,
    });
  } catch (err: any) {
    console.error("admin/users error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}