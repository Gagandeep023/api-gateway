import crypto from 'crypto';

const TIME_WINDOW_MS = 3600 * 1000; // 1 hour
const CODE_LENGTH = 16; // truncated HMAC hex chars

export function generateTOTP(browserId: string, secret: string, timeOffset: number = 0): string {
  const timeWindow = Math.floor(Date.now() / TIME_WINDOW_MS) + timeOffset;
  const message = `${browserId}:${timeWindow}`;
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return hmac.substring(0, CODE_LENGTH);
}

export function validateTOTP(browserId: string, secret: string, providedCode: string): boolean {
  const currentCode = generateTOTP(browserId, secret, 0);
  const previousCode = generateTOTP(browserId, secret, -1);
  return timingSafeEqual(providedCode, currentCode) || timingSafeEqual(providedCode, previousCode);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

export function formatKey(browserId: string, code: string): string {
  return `totp_${browserId}_${code}`;
}

export function parseKey(key: string): { browserId: string; code: string } | null {
  if (!key.startsWith('totp_')) return null;
  const parts = key.slice(5).split('_');
  // UUID has 4 dashes, so browserId has 5 parts when split by _
  // Format: totp_<uuid>_<code> where uuid = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  // But UUID uses dashes, not underscores, so it's a single segment
  if (parts.length < 2) return null;
  const code = parts[parts.length - 1];
  const browserId = parts.slice(0, -1).join('_');
  if (!browserId || !code) return null;
  return { browserId, code };
}

export function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
