import crypto from "crypto";

/**
 * Generate OTP 6 digit yang kuat secara kriptografis
 */
export function generateOTP(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, "0");
}

/**
 * Hash OTP sebelum disimpan ke database (keamanan tambahan)
 */
export function hashOTP(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

/**
 * Validasi format email sederhana
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}