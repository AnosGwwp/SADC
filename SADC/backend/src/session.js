// Sign-in tokens. After Discord sign-in the website gets a token holding the person's Discord id and name,
// signed with SESSION_SECRET, so nobody can make one up or change the id inside it.
// Format: base64url(JSON) "." base64url(HMAC-SHA256 of that part).

import crypto from 'node:crypto';

const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

export function signSession(secret, user, ttlSeconds) {
  const body = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${body}.${hmac(secret, body)}`;
}

// Returns the user inside the token, or null if it's forged, damaged or expired.
export function readSession(secret, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(secret, body));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return user.exp > Date.now() / 1000 ? user : null;
  } catch {
    return null;
  }
}

// Compares two secrets without leaking how much of them matched through the time it takes.
export function sameSecret(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
