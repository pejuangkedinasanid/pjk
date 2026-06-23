// FILE: app/api/admin/tryout/route.ts
//
// GET    /api/admin/tryout            → daftar SEMUA tryout (termasuk draft) + total pengerjaan
// POST   /api/admin/tryout            → buat tryout baru
// PATCH  /api/admin/tryout            → update tryout (body wajib ada "id")
// DELETE /api/admin/tryout?id=X       → hapus tryout
//
// Semua method memvalidasi role admin/super_admin dulu lewat header
// "x-admin-email", dicocokkan ke tabel users. Pakai SERVICE ROLE KEY
// supaya bisa baca/tulis tabel tryout tanpa tergantung RLS dari sisi
// client (karena app ini tidak pakai session Supabase Auth asli).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin(email: string | null) {
  if (!email) return false;
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .single();

  if (error || !data) return false;
  return data.role === "admin" || data.role === "super_admin";
}

// ────────────────────────────────────────────────────────────
// GET — daftar semua tryout (admin lihat draft & publish)
// ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");

  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Hanya admin." },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("tryout")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  // Sekaligus hitung total pengerjaan (dipakai untuk stat card)
  const { count: totalHasil } = await supabase
    .from("hasil_tryout")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    success: true,
    data: data || [],
    totalHasil: totalHasil ?? 0,
  });
}

// ────────────────────────────────────────────────────────────
// POST — buat tryout baru
// ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");

  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Hanya admin." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();

    if (!body.nama) {
      return NextResponse.json(
        { success: false, message: "Nama tryout wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("tryout")
      .insert(body)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("admin/tryout POST error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// PATCH — update tryout (full edit ATAU sekadar toggle status)
// ────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");

  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Hanya admin." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, message: "id wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("tryout")
      .update(fields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("admin/tryout PATCH error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

// ────────────────────────────────────────────────────────────
// DELETE — hapus tryout
// ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");

  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json(
      { success: false, message: "Akses ditolak. Hanya admin." },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { success: false, message: "id wajib diisi." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("tryout").delete().eq("id", id);

  if (error) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}