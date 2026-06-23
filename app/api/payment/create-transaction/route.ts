// FILE: app/api/payment/create-transaction/route.ts
// POST /api/payment/create-transaction
// Body: { email, paket_jumlah }
//
// 1. Validasi paket_jumlah & harga dari daftar resmi di server
//    (JANGAN percaya harga yang dikirim dari client/browser).
// 2. Simpan baris baru di tabel "transaksi" (status: pending).
// 3. Minta Snap token ke Midtrans, kembalikan ke frontend.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PAKET_TRYOUT: Record<number, number> = {
  1: 10000, 2: 19600, 3: 28800, 4: 37200, 5: 45500,
  6: 53400, 7: 60900, 8: 67200, 9: 73800, 10: 80000,
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MIDTRANS_BASE_URL = process.env.MIDTRANS_IS_PRODUCTION === "true"
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions";

export async function POST(req: NextRequest) {
  try {
    const { email, paket_jumlah } = await req.json();

    if (!email || !paket_jumlah) {
      return NextResponse.json(
        { success: false, message: "Email dan paket_jumlah wajib diisi." },
        { status: 400 }
      );
    }

    const hargaResmi = PAKET_TRYOUT[paket_jumlah];

    if (!hargaResmi) {
      return NextResponse.json(
        { success: false, message: "Paket tidak valid." },
        { status: 400 }
      );
    }

    const orderId = "KUOTA-" + paket_jumlah + "X-" + Date.now();

    const { error: errInsert } = await supabase.from("transaksi").insert({
      order_id: orderId,
      email,
      paket_jumlah,
      harga: hargaResmi,
      status: "pending",
    });

    if (errInsert) {
      console.error("Insert transaksi error:", errInsert);
      return NextResponse.json(
        { success: false, message: errInsert.message },
        { status: 500 }
      );
    }

    const authHeader =
      "Basic " + Buffer.from(process.env.MIDTRANS_SERVER_KEY + ":").toString("base64");

    const midtransRes = await fetch(MIDTRANS_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: orderId,
          gross_amount: hargaResmi,
        },
        customer_details: {
          email,
        },
        item_details: [
          {
            id: "kuota-" + paket_jumlah,
            price: hargaResmi,
            quantity: 1,
            name: paket_jumlah + "x Tryout Premium",
          },
        ],
      }),
    });

    const midtransJson = await midtransRes.json();

    if (!midtransRes.ok || !midtransJson.token) {
      console.error("Midtrans error:", midtransJson);
      return NextResponse.json(
        { success: false, message: "Gagal membuat transaksi Midtrans." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      token: midtransJson.token,
      order_id: orderId,
    });
  } catch (err) {
    console.error("create-transaction error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}