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

// GET — ambil semua notifikasi
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { data, error } = await supabase
    .from("notifikasi").select("*")
    .order("created_at", { ascending: false }).limit(50);

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

// POST — buat notifikasi baru
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { pesan, target } = await req.json();
  if (!pesan) return NextResponse.json({ success: false, message: "Pesan wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("notifikasi").insert({
    pesan,
    target: target || "all",
    unread: true,
  });

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: "Notifikasi berhasil dikirim." });
}

// DELETE — hapus notifikasi
export async function DELETE(req: NextRequest) {
  if (!(await isAdmin(req)))
    return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ success: false, message: "ID wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("notifikasi").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, message: "Notifikasi berhasil dihapus." });
}