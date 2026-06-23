import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Pakai anon key — data publik (tanpa password_akses)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/tryout
 * Query params:
 *   - akses: "gratis" | "premium" | "all" (default: "all")
 *   - limit: number (default: 10)
 *   - status: "publish" | "draft" (default: "publish")
 *
 * Dipakai oleh:
 *   - Dashboard user: menampilkan tryout terbaru
 *   - Landing page: menampilkan tryout untuk publik
 *   - Halaman tryout-tersedia.html
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const akses  = searchParams.get("akses") || "all";
  const limit  = parseInt(searchParams.get("limit") || "10");
  const status = searchParams.get("status") || "publish";

  // Gunakan view tryout_publik (tidak expose password_akses)
  let query = supabase
    .from("tryout_publik")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Filter akses
  if (akses === "gratis") {
    query = query.eq("akses", "gratis");
  } else if (akses === "premium") {
    query = query.eq("akses", "premium");
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    total: data?.length ?? 0,
  });
}