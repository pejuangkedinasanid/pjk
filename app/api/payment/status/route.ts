// FILE: app/api/payment/status/route.ts
// GET /api/payment/status?order_id=
//
// Dipakai frontend (premium.html) untuk polling status setelah
// popup Snap ditutup.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("order_id");

  if (!orderId) {
    return NextResponse.json(
      { success: false, message: "order_id wajib diisi." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("transaksi")
    .select("status, paket_jumlah")
    .eq("order_id", orderId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { success: false, message: "Transaksi tidak ditemukan." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    status: data.status,
    paket_jumlah: data.paket_jumlah,
  });
}