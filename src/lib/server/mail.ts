import "server-only";
import { appendFile, mkdir } from "node:fs/promises";

// 寄信：用 Resend 的 HTTP 接口（https://resend.com/docs/api-reference/emails/send-email），不另裝 SDK。
// 沒設 RESEND_API_KEY 時，本機開發把信寫進 .data/outbox.jsonl 並印出連結（端到端測試從這裡讀）；正式環境沒設就報錯
export type Mail = { to: string; subject: string; html: string; text: string };

const FROM = () => process.env.EMAIL_FROM || "Idolca <noreply@idolca.trade>";
export const OUTBOX = ".data/outbox.jsonl";

export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    await mkdir(".data", { recursive: true });
    await appendFile(OUTBOX, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
    console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
