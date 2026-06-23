// FILE: app/api/kuota/pakai/route.ts
// POST /api/kuota/pakai
// Body: { email, tryout_id }
// Kurangi 1 kuota_tryout milik user.

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
      .select("kuota_tryout, status_akun")
      .eq("email", email)
      .single();

    if (errUser || !userRow) {
      return NextResponse.json(
        { success: false, message: "User tidak ditemukan." },
        { status: 404 }
      );
    }

    if (
      userRow.status_akun !== "premium" ||
      !userRow.kuota_tryout ||
      userRow.kuota_tryout <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
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

    return NextResponse.json({ success: true, kuota: kuotaBaru });
  } catch (err) {
    console.error("kuota/pakai error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}