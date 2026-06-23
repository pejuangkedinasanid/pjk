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

// GET — daftar tryout
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { data, error } = await supabase
    .from("tryout")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// POST — buat tryout baru
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const body = await req.json();
  const { nama, deskripsi, tipe, mulai, selesai, is_premium, kuota } = body;

  if (!nama) return NextResponse.json({ success: false, message: "Nama tryout wajib diisi." }, { status: 400 });

  const { data, error } = await supabase.from("tryout").insert({
    nama,
    deskripsi,
    tipe:       tipe       || "nasional",
    mulai:      mulai      || null,
    selesai:    selesai    || null,
    is_premium: is_premium ?? true,
    kuota:      kuota      || null,
    aktif:      true,
  }).select().single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: "Tryout berhasil dibuat.", data });
}

// PATCH — update tryout
export async function PATCH(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("tryout").update(updates).eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: "Tryout berhasil diperbarui." });
}

// DELETE — hapus tryout
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("tryout").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: "Tryout berhasil dihapus." });
}