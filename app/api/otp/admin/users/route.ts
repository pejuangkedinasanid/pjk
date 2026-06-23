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

// GET — daftar user dengan filter & pagination
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const role   = searchParams.get("role") || "";
  const plan   = searchParams.get("plan") || "";
  const page   = parseInt(searchParams.get("page") || "1");
  const limit  = 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("users")
    .select("id,nama,username,email,role,plan,kuota_tryout,is_verified,provinsi,sekolah_kedinasan,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.or(`nama.ilike.%${search}%,email.ilike.%${search}%,username.ilike.%${search}%`);
  if (role)   query = query.eq("role", role);
  if (plan)   query = query.eq("plan", plan);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data, total: count, page, limit });
}

// PATCH — update role, plan, kuota, is_verified
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi." }, { status: 400 });

  // Hanya izinkan field tertentu
  const allowed = ["role", "plan", "kuota_tryout", "is_verified"];
  const safe: Record<string, unknown> = {};
  allowed.forEach(k => { if (updates[k] !== undefined) safe[k] = updates[k]; });

  const { error } = await supabase.from("users").update(safe).eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "User berhasil diperbarui." });
}

// DELETE — hapus user
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("users").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

  return NextResponse.json({ success: true, message: "User berhasil dihapus." });
}