// FILE: lib/session.ts
//
// Session sederhana berbasis cookie httpOnly yang di-sign (HMAC),
// tanpa perlu install library tambahan (next-auth dll). Cocok untuk
// menggantikan pola "kirim email di query string" yang rawan IDOR.
//
// PENTING: Anda perlu 1 environment variable baru:
//   SESSION_SECRET=<string acak panjang, minimal 32 karakter>
// Generate contoh: openssl rand -hex 32
// Tambahkan ini di .env lokal DAN di Vercel > Settings > Environment
// Variables (jangan sampai lupa yang di Vercel, atau login akan gagal
// di production).

import crypto from "crypto";
import { NextRequest } from "next/server";

const SECRET = process.env.SESSION_SECRET!;
const COOKIE_NAME = "pk_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export type SessionPayload = {
  id: string;
  email: string;
  role: string | null;
};

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex");
}

/** Bikin nilai cookie: base64(payload).signature */
export function createSessionCookieValue(payload: SessionPayload): string {
  const json = JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const b64 = Buffer.from(json).toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

/** Verifikasi & baca payload dari nilai cookie mentah */
export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  const expectedSig = sign(b64);
  // Perbandingan tahan timing-attack
  if (
    expectedSig.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))
  ) {
    return null;
  }

  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    if (!payload.exp || Date.now() > payload.exp) return null; // kedaluwarsa
    return { id: payload.id, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

/** Dipakai di setiap API route yang butuh identitas user yang login */
export function getSessionUser(req: NextRequest): SessionPayload | null {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  return verifySessionCookieValue(raw);
}

export const SESSION_COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  secure: true, // wajib true di production (HTTPS)
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};