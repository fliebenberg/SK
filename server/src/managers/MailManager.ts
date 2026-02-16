import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

class MailManager {
    private transporter: nodemailer.Transporter | null = null;

    async init() {
        if (process.env.SMTP_HOST) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
        } else {
            // Fallback to Ethereal for testing
            const testAccount = await nodemailer.createTestAccount();
            this.transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false, // true for 465, false for other ports
                auth: {
                    user: testAccount.user, // generated ethereal user
                    pass: testAccount.pass, // generated ethereal password
                },
            });
            console.log('Ethereal Mail Test Account Created:', testAccount.user);
        }
    }

    async sendClaimInvitation(to: string, orgName: string, claimUrl: string) {
        if (!this.transporter) await this.init();

        const info = await this.transporter!.sendMail({
            from: '"ScoreKeeper" <noreply@scorekeeper.com>',
            to,
            subject: `Action Required: Claim Ownership of ${orgName} on ScoreKeeper`,
            text: `Hi,\n\nYou have been invited to claim ownership of the organization "${orgName}" on ScoreKeeper.\n\nScoreKeeper is an online app that alows organisations to effortlessly manage sports teams, players and events. For more information you can explore our website: https://www.scorekeeper.live\n\nClaim your organization here: ${claimUrl}\n\nNot the right person? Refer someone else: ${process.env.APP_URL}/claim/refer?token=${claimUrl.split('token=')[1]}\nOr decline this invitation: ${process.env.APP_URL}/claim/decline?token=${claimUrl.split('token=')[1]}\n\nThanks,\nScoreKeeper Team`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                    
                    <!-- Header -->
                    <div style="background-color: #f97316; padding: 30px 20px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Claim your organisation on ScoreKeeper</h1>
                    </div>

                    <div style="padding: 40px 30px;">
                        <p style="font-size: 16px; color: #334155; line-height: 1.6; margin-top: 0;">Hi,</p>
                        <p style="font-size: 16px; color: #334155; line-height: 1.6;">You have been invited to take ownership of the organization <strong>${orgName}</strong> on <strong style="color: #f97316;">ScoreKeeper</strong>.</p>

                        <!-- What is ScoreKeeper? -->
                        <div style="margin-top: 30px;">
                            <h2 style="font-size: 18px; color: #0f172a; margin: 0 0 10px 0;">What is ScoreKeeper?</h2>
                            <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0;">
                                ScoreKeeper is an online app that alows organisations to effortlessly manage sports teams, players and events. For more information you can explore our website: <a href="https://www.scorekeeper.live" style="color: #f97316; text-decoration: none; font-weight: 600;">www.scorekeeper.live</a>
                            </p>
                        </div>

                        <!-- What it means to claim? -->
                        <div style="margin-top: 30px;">
                            <h2 style="font-size: 18px; color: #0f172a; margin: 0 0 10px 0;">What it means to claim an organisation?</h2>
                            <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0;">
                                By claiming <strong>${orgName}</strong>, you gain full administrative control. This allows you to:
                            </p>
                            <ul style="font-size: 14px; color: #475569; line-height: 1.6; padding-left: 20px; margin-top: 10px;">
                                <li>Manage organization details and branding.</li>
                                <li>Add more people and assign roles</li>
                                <li>Manage teams</li>
                                <li>Schedule games and events.</li>
                                <li>Access detailed reports and analytics.</li>
                            </ul>
                        </div>

                        <!-- Primary CTA -->
                        <div style="margin-top: 40px; text-align: center;">
                            <a href="${claimUrl}" style="display: inline-block; background-color: #f97316; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.3);">
                                Claim Organization
                            </a>
                        </div>

                        <!-- Not the right person? -->
                        <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e2e8f0;">
                            <h3 style="font-size: 16px; color: #64748b; margin: 0 0 15px 0; font-weight: 600;">Not the right person?</h3>
                            
                            <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                                <tr>
                                    <td width="50%" style="padding-right: 10px;">
                                        <a href="${process.env.APP_URL}/claim/refer?token=${claimUrl.split('token=')[1]}" style="display: block; text-align: center; background-color: #f1f5f9; color: #475569; padding: 12px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; border: 1px solid #e2e8f0;">
                                            Refer Someone Else
                                        </a>
                                    </td>
                                    <td width="50%" style="padding-left: 10px;">
                                        <a href="${process.env.APP_URL}/claim/decline?token=${claimUrl.split('token=')[1]}" style="display: block; text-align: center; background-color: #fff1f2; color: #e11d48; padding: 12px; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600; border: 1px solid #fecdd3;">
                                            Decline & Don't Contact
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 15px;">
                                If you decline, we will remove your email from our list for this organization.
                            </p>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                            &copy; ${new Date().getFullYear()} ScoreKeeper. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
        });

        console.log('Claim invitation sent to:', to);
        if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
            console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
        }
        return info;
    }
}

export const mailManager = new MailManager();
