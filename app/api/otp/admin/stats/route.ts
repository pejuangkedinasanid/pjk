import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin(req: NextRequest): Promise<boolean> {
  const email = req.headers.get("x-admin-email");
  if (!email) return false;
  const { data } = await supabase
    .from("users").select("role").eq("email", email).single();
  return data?.role === "admin" || data?.role === "super_admin";
}

// GET — statistik ringkasan untuk admin dashboard
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const [
    { count: totalUser },
    { count: totalPremium },
    { count: totalHasil },
    { count: totalTryout },
  ] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }).eq("plan", "premium"),
    supabase.from("hasil_tryout").select("*", { count: "exact", head: true }),
    supabase.from("tryout").select("*", { count: "exact", head: true }),
  ]);

  // User baru 7 hari terakhir
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: newUser7 } = await supabase
    .from("users").select("*", { count: "exact", head: true })
    .gte("created_at", since7);

  return NextResponse.json({
    success: true,
    data: {
      totalUser:    totalUser    ?? 0,
      totalPremium: totalPremium ?? 0,
      totalFree:    (totalUser ?? 0) - (totalPremium ?? 0),
      totalHasil:   totalHasil   ?? 0,
      totalTryout:  totalTryout  ?? 0,
      newUser7:     newUser7     ?? 0,
    },
  });
}