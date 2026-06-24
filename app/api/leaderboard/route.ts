import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/leaderboard
 * Params: type, tryout_id, email, provinsi, sekolah, page, limit
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type      = searchParams.get("type")      || "global";
  const tryout_id = searchParams.get("tryout_id") || "";
  const email     = searchParams.get("email")     || "";
  const provinsi  = searchParams.get("provinsi")  || "";
  const sekolah   = searchParams.get("sekolah")   || "";
  const page      = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit     = Math.min(50, parseInt(searchParams.get("limit") || "10"));
  const offset    = (page - 1) * limit;

  try {
    // Daftar tryout untuk dropdown filter
    const { data: tryoutList } = await supabase
      .from("tryout")
      .select("id, nama")
      .eq("status", "publish")
      .order("created_at", { ascending: false });

    // ── Filter user berdasarkan provinsi/sekolah ────────────
    let emailFilter: string[] | null = null;
    if (provinsi || sekolah) {
      let uq = supabase.from("users").select("email");
      if (provinsi) uq = uq.ilike("provinsi", `%${provinsi}%`);
      if (sekolah)  uq = uq.ilike("sekolah_kedinasan", `%${sekolah}%`);
      const { data: uf } = await uq;
      emailFilter = (uf || []).map((u: any) => u.email);
      if (!emailFilter.length) {
        return NextResponse.json({
          success: true, type, rows: [], total: 0, page, limit,
          user_rank: 0, user_data: null, tryout_list: tryoutList || [],
        });
      }
    }

    if (type === "tryout" && tryout_id) {
      // ── PER TRYOUT ──────────────────────────────────────
      let q = supabase
        .from("leaderboard_view")
        .select("*")
        .eq("tryout_id", parseInt(tryout_id))
        .order("ranking", { ascending: true });
      if (emailFilter) q = q.in("email", emailFilter);
      const { data: rows_all, error } = await q;
      if (error) throw error;

      const reranked = (rows_all || []).map((r: any, i: number) => ({ ...r, ranking: i + 1 }));
      const total    = reranked.length;

      let userRank = 0, userData: any = null;
      if (email) {
        const idx = reranked.findIndex((r: any) => r.email === email);
        if (idx >= 0) { userRank = reranked[idx].ranking; userData = reranked[idx]; }
      }

      return NextResponse.json({
        success: true, type: "tryout",
        rows: reranked.slice(offset, offset + limit),
        total, page, limit, user_rank: userRank, user_data: userData,
        tryout_list: tryoutList || [],
      });
    }

    // ── GLOBAL ────────────────────────────────────────────
    // Ambil nilai pertama per (email, tryout_id)
    let hq = supabase
      .from("hasil_tryout")
      .select("email, tryout_id, nilai, created_at")
      .eq("selesai", true)
      .order("created_at", { ascending: true });
    if (emailFilter) hq = hq.in("email", emailFilter);
    const { data: allHasil, error: hErr } = await hq;
    if (hErr) throw hErr;

    // Nilai pertama per (email, tryout_id)
    const pertamaMap: Record<string, Record<string, number>> = {};
    for (const h of (allHasil || [])) {
      if (!pertamaMap[h.email]) pertamaMap[h.email] = {};
      if (pertamaMap[h.email][h.tryout_id] === undefined)
        pertamaMap[h.email][h.tryout_id] = h.nilai || 0;
    }

    const emails = Object.keys(pertamaMap);
    if (!emails.length) {
      return NextResponse.json({
        success: true, type: "global", rows: [], total: 0, page, limit,
        user_rank: 0, user_data: null, tryout_list: tryoutList || [],
      });
    }

    // Ambil data user
    const { data: users } = await supabase
      .from("users")
      .select("email, nama, username, provinsi, sekolah_kedinasan")
      .in("email", emails);
    const userMap: Record<string, any> = {};
    for (const u of (users || [])) userMap[u.email] = u;

    // Build ranked list
    let globalRows = emails.map(em => ({
      email:             em,
      nama:              userMap[em]?.nama || userMap[em]?.username || em,
      username:          userMap[em]?.username || "",
      provinsi:          userMap[em]?.provinsi || "",
      sekolah_kedinasan: userMap[em]?.sekolah_kedinasan || "",
      total_nilai:       Object.values(pertamaMap[em]).reduce((a, b) => a + b, 0),
      jumlah_tryout:     Object.keys(pertamaMap[em]).length,
    }));

    globalRows.sort((a, b) => b.total_nilai - a.total_nilai);
    const rankedRows = globalRows.map((r, i) => ({ ...r, ranking: i + 1 }));
    const total      = rankedRows.length;

    let userRank = 0, userData: any = null;
    if (email) {
      const idx = rankedRows.findIndex(r => r.email === email);
      if (idx >= 0) { userRank = rankedRows[idx].ranking; userData = rankedRows[idx]; }
    }

    return NextResponse.json({
      success: true, type: "global",
      rows: rankedRows.slice(offset, offset + limit),
      total, page, limit, user_rank: userRank, user_data: userData,
      tryout_list: tryoutList || [],
    });

  } catch (err: any) {
    console.error("Leaderboard error:", err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}