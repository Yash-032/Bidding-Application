import nodemailer from 'nodemailer';

export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<boolean> {
  const host = process.env.SMTP_HOST || process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_SERVER_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_SERVER_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || '"QuickFashion" <no-reply@quickfashion.in>';

  let transporter;

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  } else {
    try {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch {
      transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
    }
  }

  try {
    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject: `${otpCode} is your QuickFashion Verification Code`,
      text: `Your QuickFashion email verification code is: ${otpCode}. This code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; max-width: 500px; border: 1px solid #e2e2e2; border-radius: 8px; background-color: #ffffff;">
          <h2 style="color: #111; margin: 0 0 4px 0; font-size: 24px;">QuickFashion.IN</h2>
          <p style="font-size: 13px; color: #666; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.05em;">Fashion, Just for You</p>
          <hr style="border: none; border-top: 1px solid #eaeaea; margin: 16px 0;" />
          <p style="font-size: 15px; color: #333; margin-bottom: 8px;">Your account verification code is:</p>
          <div style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #000000; padding: 14px 20px; background: #f8f8f8; border-radius: 6px; display: inline-block; margin: 8px 0 16px 0;">
            ${otpCode}
          </div>
          <p style="font-size: 13px; color: #777; line-height: 1.5; margin-top: 12px;">This code will expire in 10 minutes. Please enter this code in your QuickFashion sign-up setup to verify your email.</p>
        </div>
      `,
    });

    console.info(`[Mailer] OTP email dispatched to ${toEmail}. Message ID: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[Mailer] Failed to send OTP email to ${toEmail}:`, err);
    return false;
  }
}
