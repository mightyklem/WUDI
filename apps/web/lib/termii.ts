/**
 * Termii SMS/WhatsApp: the cheapest way to reach Nigerian phones on carriers that
 * silently drop push or email before a session starts.
 * SMS goes over the DND/transactional route; WhatsApp is a softer channel for
 * confirmed attend-only reminders. Both are opt-in at runtime — without credentials,
 * every call is a no-op so email remains the default.
 */

function termiiApi(): string {
  const base = (process.env.TERMII_API_BASE || 'https://api.ng.termii.com').replace(/\/$/, '');
  if (base === 'https://api.ng.termii.com') return base;
  let host: string;
  try {
    host = new URL(base).hostname;
  } catch {
    throw new Error('TERMII_API_BASE is not a valid URL');
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('TERMII_API_BASE may only point at localhost');
  }
  return base;
}

export function termiiEnabled(): boolean {
  return Boolean(process.env.TERMII_API_KEY);
}

function senderId(): string {
  // SMS sender IDs are 3–11 chars; WhatsApp uses the device/brand name you registered.
  return process.env.TERMII_SENDER_ID || 'Learnovize';
}

/** Normalise to Termii's expected format: digits only, starts with country code (234...). */
function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('0') && d.length === 11) d = `234${d.slice(1)}`;
  if (d.startsWith('234') && d.length >= 12) return d;
  return null;
}

function trim(msg: string): string {
  // DND blocks texts over the carrier limit; 160 GSM chars through Termii, truncate with ellipsis.
  return msg.length > 159 ? `${msg.slice(0, 157).trimEnd()}…` : msg;
}

export async function sendTermiiSms(opts: { to: string; text: string }): Promise<boolean> {
  const to = normalizePhone(opts.to);
  if (!termiiEnabled() || !to) return false;
  try {
    const r = await fetch(`${termiiApi()}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TERMII_API_KEY}` },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to,
        from: senderId(),
        sms: trim(opts.text),
        type: 'plain',
        channel: 'dnd',
      }),
    });
    if (!r.ok) {
      console.error('[termii] sms rejected:', r.status, (await r.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[termii] sms failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export async function sendTermiiWhatsapp(opts: { to: string; text: string }): Promise<boolean> {
  const to = normalizePhone(opts.to);
  if (!termiiEnabled() || !to || process.env.TERMII_WHATSAPP !== 'true') return false;
  try {
    const r = await fetch(`${termiiApi()}/api/sms/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TERMII_API_KEY}` },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to,
        from: senderId(),
        sms: trim(opts.text),
        type: 'plain',
        channel: 'whatsapp',
      }),
    });
    return r.ok;
  } catch (e) {
    console.error('[termii] whatsapp failed:', e instanceof Error ? e.message : e);
    return false;
  }
}