import nodemailer from "nodemailer";
import { getSetting } from "./settings";

export interface TriggeredAlertInfo {
  ticker: string;
  assetClass: string;
  kind: string;
  threshold: number;
  currentPrice: number;
  label: string;
}

const KIND_LABELS: Record<string, string> = {
  above: "Seuil haut franchi",
  below: "Seuil bas franchi",
  buy_target: "Cible d'achat atteinte",
  sell_target: "Cible de vente atteinte",
  stop_loss: "Stop loss touché",
  take_profit: "Take profit atteint",
};

const KIND_COLORS: Record<string, number> = {
  above: 0x10b981,
  below: 0xf43f5e,
  buy_target: 0x10b981,
  sell_target: 0xf59e0b,
  stop_loss: 0xf43f5e,
  take_profit: 0x10b981,
};

export function discordConfigured(): boolean {
  return !!getSetting("notify.discord_webhook");
}

export function telegramConfigured(): boolean {
  return !!(getSetting("notify.telegram_token") && getSetting("notify.telegram_chat_id"));
}

export function smtpConfigured(): boolean {
  return !!(getSetting("smtp.host") && getSetting("smtp.user") && getSetting("smtp.pass"));
}

export async function sendDiscord(alerts: TriggeredAlertInfo[]): Promise<void> {
  const url = getSetting("notify.discord_webhook");
  if (!url || !alerts.length) return;
  const embeds = alerts.slice(0, 10).map((a) => ({
    title: `${a.ticker} — ${KIND_LABELS[a.kind] ?? a.kind}`,
    description: a.label || undefined,
    color: KIND_COLORS[a.kind] ?? 0x10b981,
    fields: [
      { name: "Classe", value: a.assetClass === "crypto" ? "Crypto" : "Action / ETF", inline: true },
      { name: "Seuil", value: `${a.threshold.toLocaleString("fr-FR")} €`, inline: true },
      { name: "Cours actuel", value: `${a.currentPrice.toLocaleString("fr-FR")} €`, inline: true },
    ],
    footer: { text: "Atlas — alerte de prix" },
  }));
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "Atlas", embeds }),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
}

export async function sendTelegram(alerts: TriggeredAlertInfo[]): Promise<void> {
  const token = getSetting("notify.telegram_token");
  const chatId = getSetting("notify.telegram_chat_id");
  if (!token || !chatId || !alerts.length) return;
  const lines = alerts.map(
    (a) =>
      `*${a.ticker}* — ${KIND_LABELS[a.kind] ?? a.kind}\nSeuil : ${a.threshold} € / Cours : ${a.currentPrice} €`,
  );
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `🔔 Atlas — ${alerts.length} alerte(s)\n\n${lines.join("\n\n")}`,
      parse_mode: "Markdown",
    }),
  });
  if (!res.ok) throw new Error(`Telegram ${res.status}`);
}

export async function sendEmail(subject: string, html: string): Promise<void> {
  if (!smtpConfigured()) return;
  const port = Number(getSetting("smtp.port") || 587);
  const transporter = nodemailer.createTransport({
    host: getSetting("smtp.host"),
    port,
    secure: port === 465,
    auth: { user: getSetting("smtp.user"), pass: getSetting("smtp.pass") },
  });
  await transporter.sendMail({
    from: `"Atlas" <${getSetting("smtp.user")}>`,
    to: getSetting("smtp.to") || getSetting("smtp.user"),
    subject,
    html,
  });
}

export async function notifyTriggeredAlerts(alerts: TriggeredAlertInfo[]): Promise<string[]> {
  const errors: string[] = [];
  if (!alerts.length) return errors;
  const jobs: Promise<void>[] = [];
  if (discordConfigured()) jobs.push(sendDiscord(alerts));
  if (telegramConfigured()) jobs.push(sendTelegram(alerts));
  if (smtpConfigured()) {
    const rows = alerts
      .map(
        (a) =>
          `<tr><td><b>${a.ticker}</b></td><td>${KIND_LABELS[a.kind] ?? a.kind}</td><td>${a.threshold} €</td><td>${a.currentPrice} €</td></tr>`,
      )
      .join("");
    jobs.push(
      sendEmail(
        `Atlas — ${alerts.length} alerte(s) de prix`,
        `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Actif</th><th>Type</th><th>Seuil</th><th>Cours</th></tr>${rows}</table>`,
      ),
    );
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  return errors;
}

// Test helpers used by the settings page.
export async function sendTelegramTest(token: string, chatId: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "✅ Atlas — notification Telegram configurée avec succès.",
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    throw new Error(body?.description ?? `Telegram ${res.status}`);
  }
}

export async function sendDiscordTest(url: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "Atlas",
      embeds: [
        {
          title: "✅ Notification Discord configurée",
          description: "Atlas est connecté à ce salon.",
          color: 0x10b981,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Discord ${res.status}`);
}

export async function sendEmailTest(): Promise<void> {
  await sendEmail("Atlas — test de configuration SMTP", "<p>✅ SMTP configuré avec succès.</p>");
}
