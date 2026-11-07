import { sendMail } from './mailer';

/** What the password recovery email says. It is sent through `sendMail` (mailer.ts), like every email. */
class EmailService {
  /**
   * Sends the password recovery email, with both a passcode and a reset link. Returns whether it
   * went; the reason it did not is logged.
   */
  async sendPasswordRecoveryEmail(
    toEmail: string,
    data: {
      name?: string;
      resetUrl: string;
      passcode: string;
      isSocialOnly: boolean;
      provider?: string;
    }
  ): Promise<boolean> {
    const { name, resetUrl, passcode, isSocialOnly, provider } = data;
    const recipientName = name || 'ScoreKeeper User';

    const subject = isSocialOnly 
      ? 'ScoreKeeper Account Recovery & Password Setup' 
      : 'Reset your ScoreKeeper Password';

    // Premium ScoreKeeper Visual Theme - Warm Orange Scoreboard Accent
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          background-color: #f8fafc;
          margin: 0;
          padding: 0;
          color: #1e293b;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
          border: 1px solid #e2e8f0;
        }
        .header {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          padding: 32px;
          text-align: center;
          border-bottom: 4px solid #ff3e00;
        }
        .logo {
          font-size: 26px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin: 0;
        }
        .logo span {
          color: #ff3e00;
        }
        .content {
          padding: 40px 32px;
        }
        h2 {
          font-size: 22px;
          font-weight: 700;
          margin-top: 0;
          color: #0f172a;
        }
        p {
          font-size: 15px;
          line-height: 1.6;
          color: #475569;
          margin-bottom: 24px;
        }
        .info-box {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 28px;
        }
        .code-container {
          text-align: center;
          margin: 24px 0;
        }
        .passcode {
          font-size: 32px;
          font-weight: 800;
          color: #ff3e00;
          letter-spacing: 6px;
          background-color: #fff;
          border: 2px dashed #cbd5e1;
          padding: 12px 24px;
          border-radius: 8px;
          display: inline-block;
        }
        .btn {
          display: inline-block;
          background-color: #ff3e00;
          color: #ffffff !important;
          font-weight: 700;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 8px;
          font-size: 16px;
          text-align: center;
          box-shadow: 0 4px 6px -1px rgba(255, 62, 0, 0.2), 0 2px 4px -1px rgba(255, 62, 0, 0.1);
          margin: 16px 0;
          transition: all 0.2s ease;
        }
        .footer {
          background-color: #f8fafc;
          padding: 24px 32px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
        }
        .footer a {
          color: #475569;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="logo">SCORE<span>KEEPER</span></h1>
        </div>
        <div class="content">
          <h2>Hello, ${recipientName}</h2>
          
          ${isSocialOnly ? `
            <div class="info-box" style="border-left: 4px solid #3b82f6; background-color: #eff6ff;">
              <p style="margin: 0; font-weight: 600; color: #1e3a8a;">
                ℹ️ Social Account Linkage Detected
              </p>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #1e40af;">
                Your account is currently registered using <strong>${provider || 'Google'} Sign-In</strong>. 
                You can continue logging in directly via Google, or complete this setup to add a local password for email/password sign-in.
              </p>
            </div>
          ` : ''}

          <p>
            We received a request to reset your password or recover your account access. 
            Below are two secure methods to reset your password. Use whichever is most convenient for your current device:
          </p>

          <h3 style="font-size: 16px; color: #0f172a; margin-bottom: 8px;">Method 1: Enter the 6-Digit Passcode</h3>
          <p style="margin-top: 0;">Perfect for typing directly into the Expo mobile application:</p>
          
          <div class="code-container">
            <div class="passcode">${passcode}</div>
          </div>

          <h3 style="font-size: 16px; color: #0f172a; margin-top: 32px; margin-bottom: 8px;">Method 2: Click the Secure Recovery Link</h3>
          <p style="margin-top: 0;">Ideal if you are resetting directly on the web or mobile browser:</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
          </div>

          <p style="font-size: 13px; color: #94a3b8; margin-top: 28px;">
            * This password reset passcode and link are single-use and will expire in 30 minutes. If you did not request this, you can safely ignore this email; your credentials remain secure.
          </p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} ScoreKeeper. All rights reserved.</p>
          <p>You received this email because an account recovery was triggered for your address.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    const textContent = `
    ScoreKeeper - Password Reset & Recovery
    ======================================
    
    Hello ${recipientName},
    
    ${isSocialOnly ? `[Social Account Detected] Your account is linked with ${provider || 'Google'} Sign-In. You can continue using Google, or use the instructions below to create a local password.` : ''}
    
    We received a request to recover your account or reset your password. 
    Below are the two ways to reset your credentials:
    
    1. USE THE 6-DIGIT PASSCODE (Best for Expo Mobile App):
       Passcode: ${passcode}
       
    2. USE THE SECURE RECOVERY LINK:
       Reset Link: ${resetUrl}
       
    This passcode and link will expire in 30 minutes. If you did not trigger this, you can safely ignore this email.
    
    © ${new Date().getFullYear()} ScoreKeeper
    `;

    try {
      await sendMail({ to: toEmail, subject, text: textContent, html: htmlContent });
      return true;
    } catch (error) {
      console.error(`[EmailService] The password recovery email to ${toEmail} was not sent:`, error);
      return false;
    }
  }
}

export const emailService = new EmailService();
