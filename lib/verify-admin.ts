// FILE: lib/verify-admin.ts
//
// Helper dipakai semua route /api/admin/* untuk memverifikasi bahwa
// email yang dikirim lewat header "x-admin-email" memang punya role
// admin/super_admin di tabel users. Dipakai server-side dengan
// service role key, supaya tidak terkena RLS.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function verifyAdmin(email: string | null): Promise<boolean> {
  if (!email) return false;

  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return false;

  return data.role === "admin" || data.role === "super_admin";
}

export { supabase as supabaseAdmin };