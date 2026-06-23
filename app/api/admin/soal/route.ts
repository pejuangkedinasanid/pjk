// FILE: app/api/admin/soal/route.ts
//
// GET    /api/admin/soal?tryout_id=X   → daftar soal untuk 1 tryout
// POST   /api/admin/soal               → buat 1 soal baru
// PATCH  /api/admin/soal                → update soal (body wajib ada "id")
// DELETE /api/admin/soal?id=X           → hapus soal
//
// Skema tabel "soal" (sesuai migration terbaru):
//   id, tryout_id, nomor, seksi ('TWK'|'TIU'|'TKP'), teks,
//   opsi (JSONB array of {huruf, teks, benar?|bobot?}),
//   bobot_benar (INT, dipakai utk TWK/TIU: skor = bobot_benar*5),
//   gambar_url, pembahasan, created_at

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isAdmin(email: string | null) {
  if (!email) return false;
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .single();
  if (error || !data) return false;
  return data.role === "admin" || data.role === "super_admin";
}

function validateSoalPayload(body: any): string | null {
  if (!body.tryout_id) return "tryout_id wajib diisi.";
  if (!body.seksi || !["TWK", "TIU", "TKP"].includes(body.seksi))
    return "seksi wajib 'TWK', 'TIU', atau 'TKP'.";
  if (!body.teks) return "teks (pertanyaan) wajib diisi.";
  if (!Array.isArray(body.opsi) || body.opsi.length !== 5)
    return "opsi wajib array berisi 5 item (A-E).";

  const huruf = body.opsi.map((o: any) => o.huruf).sort().join("");
  if (huruf !== "ABCDE") return "opsi harus mencakup huruf A,B,C,D,E masing-masing satu.";

  if (body.opsi.some((o: any) => !o.teks)) return "setiap opsi wajib punya teks.";

  if (body.seksi === "TKP") {
    const ok = body.opsi.every(
      (o: any) => typeof o.bobot === "number" && o.bobot >= 1 && o.bobot <= 5
    );
    if (!ok) return "TKP: setiap opsi wajib punya 'bobot' 1-5.";
  } else {
    const benarCount = body.opsi.filter((o: any) => o.benar === true).length;
    if (benarCount !== 1) return "TWK/TIU: harus ada tepat satu opsi dengan benar=true.";
  }

  return null;
}

// ────────────────────────────────────────────────────────────
// GET
// ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");
  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Hanya admin." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const tryoutId = searchParams.get("tryout_id");

  if (!tryoutId) {
    return NextResponse.json({ success: false, message: "tryout_id wajib diisi." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("soal")
    .select("*")
    .eq("tryout_id", tryoutId)
    .order("nomor", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data || [] });
}

// ────────────────────────────────────────────────────────────
// POST
// ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");
  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Hanya admin." }, { status: 403 });
  }

  try {
    const body = await req.json();

    const errMsg = validateSoalPayload(body);
    if (errMsg) return NextResponse.json({ success: false, message: errMsg }, { status: 400 });

    // Pastikan "nomor" belum dipakai di tryout ini (kolom UNIQUE(tryout_id, nomor))
    if (body.nomor) {
      const { data: dup } = await supabase
        .from("soal")
        .select("id")
        .eq("tryout_id", body.tryout_id)
        .eq("nomor", body.nomor)
        .maybeSingle();

      if (dup) {
        return NextResponse.json(
          { success: false, message: "Nomor soal " + body.nomor + " sudah dipakai di tryout ini." },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase.from("soal").insert(body).select().single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("admin/soal POST error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan server." }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// PATCH
// ────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");
  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Hanya admin." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, ...fields } = body;

    if (!id) return NextResponse.json({ success: false, message: "id wajib diisi." }, { status: 400 });

    const errMsg = validateSoalPayload(fields);
    if (errMsg) return NextResponse.json({ success: false, message: errMsg }, { status: 400 });

    const { data, error } = await supabase.from("soal").update(fields).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("admin/soal PATCH error:", err);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan server." }, { status: 500 });
  }
}

// ────────────────────────────────────────────────────────────
// DELETE
// ────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const adminEmail = req.headers.get("x-admin-email");
  if (!(await isAdmin(adminEmail))) {
    return NextResponse.json({ success: false, message: "Akses ditolak. Hanya admin." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ success: false, message: "id wajib diisi." }, { status: 400 });

  const { error } = await supabase.from("soal").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}