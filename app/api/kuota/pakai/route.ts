// FILE: app/api/kuota/pakai/route.ts
// POST /api/kuota/pakai
// Body: { email, tryout_id }
//
// PERBAIKAN: pakai kolom "plan" (bukan "status_akun"), dan
// tambahkan flag "kuota_habis" di response gagal — supaya
// tryout-tersedia.html bisa langsung deteksi & redirect ke
// premium.html.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, tryout_id } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
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

    if (userRow.plan !== "premium" || !userRow.kuota_tryout || userRow.kuota_tryout <= 0) {
      return NextResponse.json(
        {
          success: false,
          kuota_habis: true,
          message: "Kuota tryout premium kamu sudah habis.",
          kuota: userRow.kuota_tryout || 0,
        },
        { status: 402 }
      );
    }

    const kuotaBaru = userRow.kuota_tryout - 1;

    const { error: errUpdate } = await supabase
      .from("users")
      .update({ kuota_tryout: kuotaBaru })
      .eq("email", email);

    if (errUpdate) {
      return NextResponse.json(
        { success: false, message: errUpdate.message },
        { status: 500 }
      );
    }

    await supabase.from("riwayat_kuota").insert({
      email,
      tryout_id: tryout_id || null,
      jenis: "pakai",
      jumlah: -1,
    });

    return NextResponse.json({
      success: true,
      kuota: kuotaBaru,
      plan: userRow.plan,
    });
  } catch (err) {
    console.error("kuota/pakai error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}