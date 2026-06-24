import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Pakai anon key — data publik (tanpa password_akses)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Client terpisah dengan service role, khusus untuk membaca data
// per-user (hasil_tryout, akses_tryout) yang tidak publik / kena RLS.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/tryout
 * Query params:
 *   - akses: "gratis" | "premium" | "all" (default: "all")
 *   - limit: number (default: 10)
 *   - status: "publish" | "draft" (default: "publish")
 *   - email: string (opsional) -> kalau diisi, setiap row akan disertai:
 *       - sudah_gratis  : true kalau user ini SUDAH MENYELESAIKAN tryout
 *                         ini dengan mode gratis (hasil_tryout.selesai=true).
 *                         Dipakai frontend untuk mengganti tombol jadi
 *                         "Upgrade ke Premium" (gratis cuma sekali).
 *       - sudah_premium : true kalau user ini SUDAH PERNAH memakai kuota
 *                         premium untuk tryout ini (ada baris di
 *                         akses_tryout mode='premium'). Dipakai frontend
 *                         supaya tidak memotong kuota lagi saat user
 *                         mengerjakan ulang tryout yang sama.
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
  const email  = searchParams.get("email");

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

  let rows = data || [];

  // ── Sisipkan flag sudah_gratis / sudah_premium kalau email dikirim ──
  if (email && rows.length) {
    const ids = rows.map((r: any) => r.id);

    const [{ data: gratisRows }, { data: premiumRows }] = await Promise.all([
      supabaseAdmin
        .from("hasil_tryout")
        .select("tryout_id")
        .eq("email", email)
        .eq("mode", "gratis")
        .eq("selesai", true)
        .in("tryout_id", ids),
      supabaseAdmin
        .from("akses_tryout")
        .select("tryout_id")
        .eq("email", email)
        .eq("mode", "premium")
        .in("tryout_id", ids),
    ]);

    const gratisDoneSet = new Set((gratisRows || []).map((r: any) => r.tryout_id));
    const premiumUnlockSet = new Set((premiumRows || []).map((r: any) => r.tryout_id));

    rows = rows.map((r: any) => ({
      ...r,
      sudah_gratis: gratisDoneSet.has(r.id),
      sudah_premium: premiumUnlockSet.has(r.id),
    }));
  }

  return NextResponse.json({
    success: true,
    data: rows,
    total: rows.length,
  });
}