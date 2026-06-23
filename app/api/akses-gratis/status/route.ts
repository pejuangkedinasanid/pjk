
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role: baca tabel akses_gratis
);
 
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tryoutId = searchParams.get("tryout_id");
  const email = searchParams.get("email");
 
  if (!tryoutId || !email) {
    return NextResponse.json(
      { success: false, message: "tryout_id dan email wajib diisi." },
      { status: 400 }
    );
  }
 
  const { data, error } = await supabase
    .from("akses_gratis")
    .select("id")
    .eq("tryout_id", tryoutId)
    .eq("email", email)
    .eq("status", "aktif")
    .maybeSingle();
 
  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
 
  return NextResponse.json({ success: true, hasAccess: !!data });
}
 
 