
// ────────────────────────────────────────────────────────────
// FILE: app/api/tryout/[id]/route.ts
// GET  /api/tryout/:id — detail 1 tryout (dari view tryout_publik,
// dipakai tryout-akses.html untuk ambil nama/banner/gform_url)
// ────────────────────────────────────────────────────────────
 
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
const supabasePublic = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
 
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabasePublic
    .from("tryout_publik")
    .select("*")
    .eq("id", params.id)
    .single();
 
  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Tryout tidak ditemukan." },
      { status: 404 }
    );
  }
 
  return NextResponse.json({ success: true, data });
}
 
 