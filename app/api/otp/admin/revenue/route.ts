// FILE: app/api/admin/revenue/route.ts
// GET /api/admin/revenue?bulan=6&tahun=2026
//
// Menghitung total pendapatan dari tabel "transaksi" (status = 'success'):
//   - mingguIni        : total dalam 7 hari terakhir (rolling)
//   - bulanTerpilih    : total pada bulan & tahun yang dipilih admin
//   - totalKeseluruhan : total dari semua transaksi sukses, sepanjang waktu
//
// Akses dibatasi hanya untuk user dengan role 'admin' atau 'super_admin'
// (dicek via header x-admin-email, dicocokkan ke tabel users).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // ── 1. Validasi admin ──
    const adminEmail = req.headers.get("x-admin-email");

    if (!adminEmail) {
      return NextResponse.json(
        { success: false, message: "Header x-admin-email wajib diisi." },
        { status: 401 }
      );
    }

    const { data: adminRow, error: errAdmin } = await supabase
      .from("users")
      .select("role")
      .eq("email", adminEmail)
      .single();

    if (errAdmin || !adminRow || (adminRow.role !== "admin" && adminRow.role !== "super_admin")) {
      return NextResponse.json(
        { success: false, message: "Akses ditolak. Hanya admin." },
        { status: 403 }
      );
    }

    // ── 2. Ambil parameter bulan/tahun ──
    const { searchParams } = new URL(req.url);
    const now = new Date();

    const bulan = parseInt(searchParams.get("bulan") || String(now.getMonth() + 1));
    const tahun = parseInt(searchParams.get("tahun") || String(now.getFullYear()));

    // ── 3. Ambil SEMUA transaksi sukses (harga + created_at) ──
    // Untuk skala data yang lebih besar, ini sebaiknya diganti agregasi
    // langsung di SQL (RPC/function di Supabase) daripada fetch semua baris.
    const { data: allSuccess, error: errFetch } = await supabase
      .from("transaksi")
      .select("harga, created_at")
      .eq("status", "success");

    if (errFetch) {
      return NextResponse.json(
        { success: false, message: errFetch.message },
        { status: 500 }
      );
    }

    const rows = allSuccess || [];

    // ── 4. Total keseluruhan (semua waktu) ──
    const totalKeseluruhan = rows.reduce((sum, r) => sum + (r.harga || 0), 0);

    // ── 5. Minggu ini (7 hari terakhir, rolling) ──
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const mingguIni = rows
      .filter((r) => new Date(r.created_at) >= sevenDaysAgo)
      .reduce((sum, r) => sum + (r.harga || 0), 0);

    // ── 6. Bulan & tahun yang dipilih admin ──
    const bulanTerpilih = rows
      .filter((r) => {
        const d = new Date(r.created_at);
        return d.getMonth() + 1 === bulan && d.getFullYear() === tahun;
      })
      .reduce((sum, r) => sum + (r.harga || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        mingguIni,
        bulanTerpilih,
        totalKeseluruhan,
        bulan,
        tahun,
      },
    });
  } catch (err) {
    console.error("admin/revenue error:", err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}