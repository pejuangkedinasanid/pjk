// FILE: app/api/admin/video/route.ts
// GET    /api/admin/video                -> daftar semua video (publish + draft)
// POST   /api/admin/video                -> tambah video baru
// PATCH  /api/admin/video                -> update video (body harus ada "id")
// DELETE /api/admin/video?id=...         -> hapus video
//
// Header semua method: x-admin-email (diverifikasi via lib/verify-admin,
// sama persis seperti admin/stats, admin/revenue, dll).

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, supabaseAdmin } from "@/lib/verify-admin";

export async function GET(req: NextRequest) {
  try {
    const adminEmail = req.headers.get("x-admin-email");
    if (!(await verifyAdmin(adminEmail))) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("video_pembahasan")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    console.error("admin/video GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminEmail = req.headers.get("x-admin-email");
    if (!(await verifyAdmin(adminEmail))) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    const body = await req.json();
    const { judul, kategori, youtube_url, banner_url, status } = body;

    if (!judul || !youtube_url) {
      return NextResponse.json(
        { success: false, message: "Judul dan link YouTube wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("video_pembahasan")
      .insert({
        judul,
        kategori: kategori || "Umum",
        youtube_url,
        banner_url: banner_url || null,
        status: status === "draft" ? "draft" : "publish",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("admin/video POST error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminEmail = req.headers.get("x-admin-email");
    if (!(await verifyAdmin(adminEmail))) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    const body = await req.json();
    const { id, judul, kategori, youtube_url, banner_url, status } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: "ID video wajib diisi." }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (judul !== undefined) updateData.judul = judul;
    if (kategori !== undefined) updateData.kategori = kategori;
    if (youtube_url !== undefined) updateData.youtube_url = youtube_url;
    if (banner_url !== undefined) updateData.banner_url = banner_url;
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabaseAdmin
      .from("video_pembahasan")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("admin/video PATCH error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminEmail = req.headers.get("x-admin-email");
    if (!(await verifyAdmin(adminEmail))) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, message: "ID video wajib diisi." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("video_pembahasan").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("admin/video DELETE error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}