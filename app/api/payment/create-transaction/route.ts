// FILE: app/api/payment/create-transaction/route.ts
// POST /api/payment/create-transaction
//
// Mendukung 2 tipe transaksi:
//   1. Kuota tryout premium  -> Body: { email, paket_jumlah }
//      (atau eksplisit: { email, tipe: 'kuota', paket_jumlah })
//   2. Modul/materi berbayar -> Body: { email, tipe: 'modul', modul_id }
//
// Untuk KEDUA tipe, harga SELALU diambil ulang dari server (daftar
// paket resmi untuk kuota, atau tabel "modul" untuk modul) -- harga
// dari client TIDAK PERNAH dipercaya.

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
    const body = await req.json();

    console.log("BODY:", body);
    const { email, paket_jumlah, modul_id } = body;
    // Default 'kuota' supaya premium.html yang lama (tidak kirim field
    // 'tipe' sama sekali) tetap jalan tanpa perlu diubah.
    const tipe: "kuota" | "modul" = body.tipe === "modul" ? "modul" : "kuota";

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email wajib diisi." },
        { status: 400 }
      );
    }

    let orderId: string;
    let hargaResmi: number;
    let itemId: string;
    let itemName: string;
    let insertRow: Record<string, any>;

    if (tipe === "kuota") {
      if (!paket_jumlah) {
        return NextResponse.json(
          { success: false, message: "paket_jumlah wajib diisi." },
          { status: 400 }
        );
      }

      hargaResmi = PAKET_TRYOUT[paket_jumlah];
      if (!hargaResmi) {
        return NextResponse.json({ success: false, message: "Paket tidak valid." }, { status: 400 });
      }

      orderId = "KUOTA-" + paket_jumlah + "X-" + Date.now();
      itemId = "kuota-" + paket_jumlah;
      itemName = paket_jumlah + "x Tryout Premium";
      insertRow = {
        order_id: orderId,
        email,
        tipe: "kuota",
        paket_jumlah,
        harga: hargaResmi,
        status: "pending",
      };
    } else {
      // tipe === "modul"
      if (!modul_id) {
        return NextResponse.json(
          { success: false, message: "modul_id wajib diisi." },
          { status: 400 }
        );
      }

      const { data: modulRow, error: errModul } = await supabase
        .from("modul")
        .select("id, judul, akses, harga, status")
        .eq("id", modul_id)
        .maybeSingle();

      if (errModul || !modulRow) {
        return NextResponse.json({ success: false, message: "Modul tidak ditemukan." }, { status: 404 });
      }

      if (modulRow.akses !== "berbayar") {
        return NextResponse.json(
          { success: false, message: "Modul ini gratis, tidak perlu dibayar." },
          { status: 400 }
        );
      }

      // Sudah lunas sebelumnya? Jangan buat transaksi baru lagi.
      const { data: sudahLunas } = await supabase
        .from("modul_unduhan")
        .select("id")
        .eq("email", email)
        .eq("modul_id", modul_id)
        .eq("status", "lunas")
        .maybeSingle();

      if (sudahLunas) {
        return NextResponse.json({ success: false, sudah_lunas: true, message: "Modul ini sudah pernah kamu beli." }, { status: 400 });
      }

      hargaResmi = modulRow.harga;
      if (!hargaResmi || hargaResmi <= 0) {
        return NextResponse.json({ success: false, message: "Harga modul tidak valid." }, { status: 400 });
      }

      orderId = "MODUL-" + modul_id + "-" + Date.now();
      itemId = "modul-" + modul_id;
      itemName = modulRow.judul;
      insertRow = {
        order_id: orderId,
        email,
        tipe: "modul",
        modul_id,
        harga: hargaResmi,
        status: "pending",
      };
    }

    const { error: errInsert } = await supabase.from("transaksi").insert(insertRow);

    if (errInsert) {
      console.error("Insert transaksi error:", errInsert);
      return NextResponse.json({ success: false, message: errInsert.message }, { status: 500 });
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
        customer_details: { email },
        item_details: [
          { id: itemId, price: hargaResmi, quantity: 1, name: itemName },
        ],
      }),
    });

    const midtransJson = await midtransRes.json();
    console.log("MIDTRANS STATUS:", midtransRes.status);
    console.log("MIDTRANS RESPONSE:", JSON.stringify(midtransJson, null, 2));
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