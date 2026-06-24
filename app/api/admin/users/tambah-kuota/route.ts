// FILE: app/api/admin/users/tambah-kuota/route.ts
// POST /api/admin/users/tambah-kuota
// Body: { email, jumlah }
//
// Menambah kuota_tryout milik seorang user. Kalau plan user masih
// "free", otomatis dinaikkan ke "premium" (karena kuota tryout
// premium cuma berguna untuk akun premium). Tercatat di tabel
// riwayat_kuota dengan jenis "tambah" supaya ada jejak siapa yang
// menambahkan & kapan.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, jumlah } = await req.json();

    const jumlahTambah = parseInt(jumlah);

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    if (!jumlahTambah || jumlahTambah <= 0) {
      return NextResponse.json(
        { success: false, message: "Jumlah kuota harus berupa angka positif." },
        { status: 400 }
      );
    }

    const { data: userRow, error: errUser } = await supabase
      .from("users")
      .select("kuota_tryout, plan")
      .eq("email", email)
      .single();

    if (errUser || !userRow) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    const kuotaBaru = (userRow.kuota_tryout || 0) + jumlahTambah;
    const planBaru  = userRow.plan === "premium" ? "premium" : "premium"; // selalu jadi premium begitu diberi kuota

    const { error: errUpdate } = await supabase
      .from("users")
      .update({ kuota_tryout: kuotaBaru, plan: planBaru })
      .eq("email", email);

    if (errUpdate) {
      return NextResponse.json(
        { success: false, message: errUpdate.message },
        { status: 500 }
      );
    }

    await supabase.from("riwayat_kuota").insert({
      email,
      tryout_id: null,
      jenis: "tambah",
      jumlah: jumlahTambah,
    });

    return NextResponse.json({
      success: true,
      kuota: kuotaBaru,
      plan: planBaru,
    });
  } catch (err: any) {
    console.error("admin/users/tambah-kuota error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}