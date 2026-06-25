// FILE: app/api/profil/route.ts
// GET   /api/profil?email=...                -> ambil data profil user
// PATCH /api/profil                           -> update data profil user
//   Body: { email, nama, username, sekolah_kedinasan, provinsi, tahun_seleksi }
//
// PERBAIKAN (revisi ini): nama kolom disesuaikan dengan register.html
// yang sebenarnya -- "provinsi" (bukan "daerah"), dan "username"
// adalah kolom TERPISAH dari "nama" (sebelumnya keliru digabung jadi
// satu field).
//
// Email TIDAK BISA diubah lewat sini -- dipakai sebagai identitas
// utama di seluruh sistem (localStorage, semua API lain dikunci by
// email), mengubahnya berisiko merusak data lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("users")
      .select("nama, username, email, sekolah_kedinasan, provinsi, tahun_seleksi, plan, kuota_tryout, role, created_at")
      .eq("email", email)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("profil GET error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, nama, username, sekolah_kedinasan, provinsi, tahun_seleksi } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    if (!nama || !nama.trim()) {
      return NextResponse.json(
        { success: false, message: "Nama tidak boleh kosong." },
        { status: 400 }
      );
    }

    if (!username || !username.trim()) {
      return NextResponse.json(
        { success: false, message: "Username tidak boleh kosong." },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {
      nama: nama.trim(),
      username: username.trim(),
      sekolah_kedinasan: sekolah_kedinasan || null,
      provinsi: provinsi || null,
    };
    if (tahun_seleksi) updateData.tahun_seleksi = tahun_seleksi;

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("email", email)
      .select("nama, username, email, sekolah_kedinasan, provinsi, tahun_seleksi, plan, kuota_tryout, role, created_at")
      .single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("profil PATCH error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}