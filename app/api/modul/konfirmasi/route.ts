// FILE: app/api/modul/konfirmasi/route.ts
// POST /api/modul/konfirmasi
// Body: { email, modul_id }
//
// !!! SIMULASI / SEMENTARA !!!
// Ini cuma menandai status='lunas' langsung tanpa verifikasi
// pembayaran sungguhan. Begitu kamu kasih tahu payment gateway yang
// dipakai di premium.html (Midtrans/Xendit/dll), ganti isi route ini
// jadi WEBHOOK yang dipanggil oleh payment gateway tersebut setelah
// pembayaran benar-benar terverifikasi -- JANGAN biarkan endpoint ini
// bisa dipanggil bebas dari klien di production, karena siapa pun bisa
// "membayar gratis" dengan memanggil endpoint ini langsung.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { email, modul_id } = await req.json();

    if (!email || !modul_id) {
      return NextResponse.json(
        { success: false, message: "Data tidak lengkap." },
        { status: 400 }
      );
    }

    const { data: row, error: errFind } = await supabase
      .from("modul_unduhan")
      .select("id, status")
      .eq("email", email)
      .eq("modul_id", modul_id)
      .maybeSingle();

    if (errFind || !row) {
      return NextResponse.json(
        { success: false, message: "Transaksi tidak ditemukan. Pilih metode pembayaran dulu." },
        { status: 404 }
      );
    }

    const { error: errUpdate } = await supabase
      .from("modul_unduhan")
      .update({ status: "lunas" })
      .eq("id", row.id);

    if (errUpdate) {
      return NextResponse.json({ success: false, message: errUpdate.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("modul/konfirmasi error:", err);
    return NextResponse.json(
      { success: false, message: err?.message || "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}