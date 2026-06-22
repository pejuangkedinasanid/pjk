import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // pakai service role agar bisa insert
);

function generateOTP(): string {
  const bytes = crypto.randomBytes(4);
  return (bytes.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
}

function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// Rate limiting sederhana in-memory
const rateMap = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Email tidak valid." },
        { status: 400 }
      );
    }

    const emailLower = email.toLowerCase().trim();

    // Rate limit: maks 3x per 10 menit
    const now = Date.now();
    const rate = rateMap.get(emailLower);
    if (rate && now < rate.resetAt) {
      if (rate.count >= 3) {
        return NextResponse.json(
          { success: false, message: "Terlalu banyak permintaan. Tunggu beberapa menit." },
          { status: 429 }
        );
      }
      rate.count++;
    } else {
      rateMap.set(emailLower, { count: 1, resetAt: now + 10 * 60 * 1000 });
    }

    // Cek apakah email sudah terdaftar di Supabase
    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", emailLower)
      .maybeSingle();

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Email tidak ditemukan. Silakan daftar terlebih dahulu." },
        { status: 404 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOtp = hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 menit

    // Hapus OTP lama, simpan yang baru
    await supabase.from("otp_codes").delete().eq("email", emailLower);
    await supabase.from("otp_codes").insert({
      email: emailLower,
      hashed_otp: hashedOtp,
      expires_at: expiresAt,
      used: false,
    });

    // Kirim email via Resend
    const digits = otp.split("");
    const digitBoxes = digits
      .map(
        (d) =>
          `<td style="width:48px;height:60px;background:#F0F5FF;border:2px solid #14274e;border-radius:10px;text-align:center;vertical-align:middle;font-size:28px;font-weight:800;color:#14274e;font-family:'Courier New',monospace;">${d}</td>`
      )
      .join("");

    const { error } = await resend.emails.send({
      from: "Pejuang Kedinasan <noreply@pejuangkedinasan.id>", // ganti domain Anda
      to: [emailLower],
      subject: `[${otp}] Kode Verifikasi Pejuang Kedinasan`,
      html: `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr>
          <td style="background:#14274e;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
            <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:0.5px;">PEJUANG KEDINASAN</div>
            <div style="color:#A8C0E0;font-size:12px;margin-top:4px;">Platform Tryout Kedinasan No.1 Indonesia</div>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:40px;border-left:1px solid #E0E7F0;border-right:1px solid #E0E7F0;">
            <p style="font-size:13px;color:#6B7A8D;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Kode Verifikasi</p>
            <h1 style="font-size:22px;color:#14274e;font-weight:700;margin:0 0 16px;">Aktifkan akun Anda</h1>
            <p style="font-size:15px;color:#4A5568;line-height:1.6;margin:0 0 28px;">
              Halo! Gunakan kode OTP berikut untuk mengaktifkan akun <strong style="color:#14274e;">${emailLower}</strong>:
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;border-collapse:separate;border-spacing:8px;">
              <tr>${digitBoxes}</tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="background:#FFF8E1;border-left:4px solid #F4C430;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:28px;width:100%;">
              <tr><td style="font-size:13px;color:#7A5C00;line-height:1.5;">
                ⏱️ Kode berlaku <strong>5 menit</strong> dan hanya dapat digunakan satu kali. Jangan bagikan kepada siapapun.
              </td></tr>
            </table>
            <p style="font-size:14px;color:#6B7A8D;margin:0;">Jika tidak merasa mendaftar, abaikan email ini.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F0F4F9;border:1px solid #E0E7F0;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
            <p style="font-size:12px;color:#8A97A8;margin:0;">&copy; ${new Date().getFullYear()} Pejuang Kedinasan. Email otomatis, mohon tidak dibalas.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json(
        { success: false, message: "Gagal mengirim email. Coba lagi." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Kode OTP dikirim ke ${emailLower}. Berlaku 5 menit.`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Terjadi kesalahan server." },
      { status: 500 }
    );
  }
}