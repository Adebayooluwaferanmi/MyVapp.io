import nodemailer from "nodemailer";

import { AppError } from "./app-error";
import { env } from "../config/env";

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let transporter: nodemailer.Transporter | null = null;

function hasSmtpConfiguration() {
  return Boolean(
    env.SMTP_HOST &&
      env.SMTP_PORT &&
      env.SMTP_USER &&
      env.SMTP_PASSWORD &&
      env.SMTP_FROM_EMAIL
  );
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (env.NODE_ENV === "test" && !hasSmtpConfiguration()) {
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });

    return transporter;
  }

  if (!hasSmtpConfiguration()) {
    throw new AppError(
      "Email delivery is not configured yet. Add the SMTP settings before sending voter invites.",
      503
    );
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD
    }
  });

  return transporter;
}

export async function sendMail(input: SendMailInput) {
  const fromEmail = env.SMTP_FROM_EMAIL ?? "no-reply@myvapp.local";

  return getTransporter().sendMail({
    from: env.SMTP_FROM_NAME
      ? `"${env.SMTP_FROM_NAME}" <${fromEmail}>`
      : fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
}
