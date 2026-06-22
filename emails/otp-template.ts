interface OTPEmailProps {
  otp: string;
  email: string;
  expiryMinutes?: number;
}

/**
 * Template email HTML untuk OTP tryout kedinasan
 * Desain resmi, bersih, mudah dibaca di semua email client
 */
export function OTPEmailTemplate({
  otp,
  email,
  expiryMinutes = 5,
}: OTPEmailProps): string {
  const digits = otp.split("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kode Verifikasi Tryout Kedinasan</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header / Logo Bar -->
          <tr>
            <td style="background:#1A3A6B;border-radius:12px 12px 0 0;padding:28px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <!-- Ikon bintang sederhana sebagai logo placeholder -->
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <polygon points="14,2 17.5,10.5 26,11 20,17 22,25 14,20.5 6,25 8,17 2,11 10.5,10.5" fill="#F4C430" stroke="#F4C430" stroke-width="0.5"/>
                </svg>
                <span style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.5px;">TRYOUT KEDINASAN</span>
              </div>
              <p style="color:#A8C0E0;font-size:12px;margin:6px 0 0;letter-spacing:0.3px;">SISTEM SELEKSI KOMPETENSI APARATUR SIPIL NEGARA</p>
            </td>
          </tr>

          <!-- Body Card -->
          <tr>
            <td style="background:#FFFFFF;padding:40px 40px 32px;border-left:1px solid #E0E7F0;border-right:1px solid #E0E7F0;">

              <p style="font-size:13px;color:#6B7A8D;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Kode Verifikasi</p>
              <h1 style="font-size:22px;color:#1A2B4A;font-weight:700;margin:0 0 16px;line-height:1.3;">Masukkan kode OTP Anda</h1>

              <p style="font-size:15px;color:#4A5568;line-height:1.6;margin:0 0 28px;">
                Halo, permintaan masuk ke sistem tryout kedinasan diterima untuk akun
                <strong style="color:#1A3A6B;">${email}</strong>.
                Gunakan kode berikut untuk melanjutkan:
              </p>

              <!-- OTP Box -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;border-collapse:separate;border-spacing:8px;">
                <tr>
                  ${digits
                    .map(
                      (d) => `<td style="
                      width:48px;height:60px;
                      background:#F0F5FF;
                      border:2px solid #1A3A6B;
                      border-radius:10px;
                      text-align:center;
                      vertical-align:middle;
                      font-size:28px;
                      font-weight:700;
                      color:#1A3A6B;
                      font-family:'Courier New',monospace;
                    ">${d}</td>`
                    )
                    .join("")}
                </tr>
              </table>

              <!-- Expiry notice -->
              <table cellpadding="0" cellspacing="0" style="background:#FFF8E1;border-left:4px solid #F4C430;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:28px;width:100%;">
                <tr>
                  <td style="font-size:13px;color:#7A5C00;line-height:1.5;">
                    ⏱️ &nbsp;Kode ini berlaku selama <strong>${expiryMinutes} menit</strong> dan hanya dapat digunakan satu kali.
                    Jangan bagikan kode ini kepada siapapun.
                  </td>
                </tr>
              </table>

              <p style="font-size:14px;color:#6B7A8D;line-height:1.6;margin:0;">
                Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.
                Akun Anda tetap aman.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F0F4F9;border:1px solid #E0E7F0;border-top:none;border-radius:0 0 12px 12px;padding:20px 40px;text-align:center;">
              <p style="font-size:12px;color:#8A97A8;margin:0;line-height:1.6;">
                Email ini dikirim secara otomatis oleh sistem. Mohon tidak membalas email ini.<br>
                &copy; ${new Date().getFullYear()} Tryout Kedinasan. Seluruh hak dilindungi.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}