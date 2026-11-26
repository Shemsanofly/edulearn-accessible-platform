import nodemailer from 'nodemailer';
import { config } from '../config.js';

/**
 * Send a plain-text email when SMTP is configured. Returns false (and sends nothing) when it isn't,
 * so callers can fall back to showing a link to the administrator.
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  if (!config.smtp) return false;
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  await transport.sendMail({ from: config.smtp.from, to, subject, text });
  return true;
}
