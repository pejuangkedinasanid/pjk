import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();

    if (!email || !otp) {
      return NextResponse.json(
        { success: false, message: "Email dan OTP wajib diisi." },
        { status: 400 }
      );
    }

    if (!/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, message: "Kode OTP harus 6 digit angka." },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();
    const hashedInput = hashOTP(otp);

    // Ambil OTP terbaru yang belum dipakai
    const { data: otpRecord, error: fetchError } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", emailLower)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !otpRecord) {
      return NextResponse.json(
        { success: false, message: "Kode OTP tidak ditemukan atau sudah digunakan." },
        { status: 400 }
      );
    }

    // Cek kedaluwarsa
    if (new Date() > new Date(otpRecord.expires_at)) {
      return NextResponse.json(
        { success: false, message: "Kode OTP sudah kedaluwarsa. Minta kode baru." },
        { status: 400 }
      );
    }

    // Cocokkan OTP (timing-safe)
    const storedBuf = Buffer.from(otpRecord.hashed_otp, "hex");
    const inputBuf = Buffer.from(hashedInput, "hex");

    if (
      storedBuf.length !== inputBuf.length ||
      !crypto.timingSafeEqual(storedBuf, inputBuf)
    ) {
      return NextResponse.json(
        { success: false, message: "Kode OTP tidak valid." },
        { status: 400 }
      );
    }

    // Tandai OTP sudah dipakai
    await supabase
      .from("otp_codes")
      .update({ used: true })
      .eq("id", otpRecord.id);

    // Update user menjadi verified
    await supabase
      .from("users")
      .update({ is_verified: true })
      .eq("email", emailLower);

    return NextResponse.json({
      success: true,
      message: "Verifikasi berhasil! Akun Anda telah aktif.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}