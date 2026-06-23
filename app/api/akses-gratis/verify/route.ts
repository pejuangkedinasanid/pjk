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
 
    const { data, error } = await supabase
      .from("akses_gratis")
      .select("password_akses, status")
      .eq("tryout_id", tryout_id)
      .eq("email", email)
      .single();
 
    if (error || !data) {
      return NextResponse.json(
        { success: false, message: "Kamu belum memiliki akses untuk tryout ini." },
        { status: 404 }
      );
    }
 
    if (data.status !== "aktif") {
      return NextResponse.json(
        { success: false, message: "Akses kamu belum aktif. Hubungi admin." },
        { status: 403 }
      );
    }
 
    if (data.password_akses !== password) {
      return NextResponse.json(
        { success: false, message: "Password salah. Silakan coba lagi." },
        { status: 401 }
      );
    }
 
    return NextResponse.json({ success: true, message: "Akses diberikan." });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}
 