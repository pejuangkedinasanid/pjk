// FILE: lib/session.ts
//
// Session sederhana berbasis cookie httpOnly yang di-sign (HMAC).
//
// PENTING: butuh environment variable SESSION_SECRET (sudah Anda
// pasang di Vercel sebelumnya -- tidak berubah).

import crypto from "crypto";
import { NextRequest } from "next/server";

const SECRET = process.env.SESSION_SECRET!;
const COOKIE_NAME = "pk_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 hari

export type SessionPayload = {
  id: string;
  email: string;
  role: string | null;
  harusResetPassword: boolean;
};

function sign(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("hex");
}

export function createSessionCookieValue(payload: SessionPayload): string {
  const json = JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const b64 = Buffer.from(json).toString("base64url");
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function verifySessionCookieValue(value: string | undefined): SessionPayload | null {
  if (!value) return null;
  const [b64, sig] = value.split(".");
  if (!b64 || !sig) return null;

  const expectedSig = sign(b64);
  if (
    expectedSig.length !== sig.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig))
  ) {
    return null;
  }

  try {
    const json = Buffer.from(b64, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    if (!payload.exp || Date.now() > payload.exp) return null;
    return {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      harusResetPassword: !!payload.harusResetPassword,
    };
  } catch {
    return null;
  }
}

/** Dipakai di endpoint yang BOLEH diakses walau user masih wajib reset
 *  (contoh: endpoint reset password itu sendiri). Tidak mengecek flag. */
export function getSessionUser(req: NextRequest): SessionPayload | null {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  return verifySessionCookieValue(raw);
}

/** Dipakai di endpoint DATA BIASA (kuota, riwayat, akses, dll).
 *  Menolak akses kalau user masih wajib ganti password dulu. */
export function getActiveSessionUser(req: NextRequest): {
  session: SessionPayload | null;
  blockedByReset: boolean;
} {
  const session = getSessionUser(req);
  if (!session) return { session: null, blockedByReset: false };
  if (session.harusResetPassword) return { session: null, blockedByReset: true };
  return { session, blockedByReset: false };
}

export const SESSION_COOKIE_OPTIONS = {
  name: COOKIE_NAME,
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};