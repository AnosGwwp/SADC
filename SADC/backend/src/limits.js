// At most `perMinute` requests per visitor per minute, so one client can't flood the server or the Solana RPC.
// The visitor is req.ip: behind Caddy that's the real address (see `trust proxy` in server.js).
// Requests from this machine (the Discord bot) aren't limited.

const isLocal = (ip) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

export function rateLimit(perMinute) {
  const counts = new Map(); // ip -> { n, resetAt }
  // Forget visitors whose minute is over, so the map doesn't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, c] of counts) if (c.resetAt <= now) counts.delete(ip);
  }, 60_000).unref();

  return (req, res, next) => {
    if (isLocal(req.ip)) return next();
    const now = Date.now();
    let c = counts.get(req.ip);
    if (!c || c.resetAt <= now) {
      c = { n: 0, resetAt: now + 60_000 };
      counts.set(req.ip, c);
    }
    c.n += 1;
    if (c.n > perMinute) {
      res.set('Retry-After', String(Math.ceil((c.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
    }
    next();
  };
}
