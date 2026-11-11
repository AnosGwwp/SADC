// SADC backend (Solana And Discord Connector).
//
// 1. The website signs the person in with Discord (/auth/discord) and gets a signed session token back.
// 2. They connect a wallet and sign a message with it (/api/message), proving it's theirs.
// 3. /api/verify checks the signature, that neither the wallet nor the Discord account is linked elsewhere,
//    and that the wallet holds an NFT from the collection. Only then is the link saved to data/links.json.
// 4. The Discord bot follows /api/bot/stream and gives the holder role to everyone on the list.
//    Every few minutes each linked wallet is checked again, so selling the NFT takes the role away.

import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { authorizeUrl, fetchUser } from './discord.js';
import { rateLimit } from './limits.js';
import { LinkStore } from './links.js';
import { readSession, sameSecret, signSession } from './session.js';
import { countHeld, isAddress, signText, verifySignature } from './solana.js';

try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const env = (name, fallback = '') => (process.env[name] ?? fallback).trim();
const config = {
  port: Number(env('PORT')) || 2001,
  // 127.0.0.1 accepts connections from this machine only (Caddy, the Discord bot), never from the internet.
  host: env('HOST', '0.0.0.0'),
  publicUrl: env('PUBLIC_URL').replace(/\/+$/, ''),
  frontendUrl: env('FRONTEND_URL').replace(/\/+$/, ''),
  extraOrigins: env('ALLOWED_ORIGINS').split(',').map((o) => o.trim()).filter(Boolean),
  appName: env('APP_NAME', 'TakeTheFloor'),
  discordClientId: env('DISCORD_CLIENT_ID'),
  discordClientSecret: env('DISCORD_CLIENT_SECRET'),
  sessionSecret: env('SESSION_SECRET'),
  botSecret: env('BOT_SECRET'),
  rpcUrl: env('SOLANA_RPC_URL'),
  collection: env('COLLECTION_ADDRESS'),
  collectionName: env('COLLECTION_NAME', 'the collection'),
  minHold: Math.max(1, Number(env('MIN_HOLD')) || 1),
  recheckMinutes: Math.max(1, Number(env('RECHECK_MINUTES')) || 10),
  rateLimitPerMinute: Number(env('RATE_LIMIT_PER_MIN')) || 60,
  dataDir: env('DATA_DIR', 'data'),
};
const SESSION_DAYS = 7;
const SIGN_WINDOW_MS = 10 * 60_000; // a signed message counts for 10 minutes

const problems = [
  !config.publicUrl && 'PUBLIC_URL (this backend\'s own address, e.g. https://sadc.example.com)',
  !config.frontendUrl && 'FRONTEND_URL (the website\'s address)',
  !config.discordClientId && 'DISCORD_CLIENT_ID',
  !config.discordClientSecret && 'DISCORD_CLIENT_SECRET',
  config.sessionSecret.length < 32 && 'SESSION_SECRET (at least 32 random characters)',
  config.botSecret.length < 16 && 'BOT_SECRET (at least 16 random characters, the same in the bot\'s .env)',
  !config.rpcUrl && 'SOLANA_RPC_URL',
  !isAddress(config.collection) && 'COLLECTION_ADDRESS (the collection\'s address)',
].filter(Boolean);
if (problems.length) {
  console.error(`Missing or invalid in .env (see .env.example):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
const redirectUri = `${config.publicUrl}/auth/discord/callback`;
const secureCookie = config.publicUrl.startsWith('https://');

const links = new LinkStore(config.dataDir);
await links.load();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(cors({ origin: [new URL(config.frontendUrl).origin, ...config.extraOrigins] }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.use(rateLimit(config.rateLimitPerMinute));
app.use(express.json({ limit: '10kb' }));

const fail = (res, status, error) => res.status(status).json({ error });
const short = (wallet) => `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

// Sends the person back to the website. The token goes after "#", which browsers never send to a server.
function backToSite(res, params) {
  res.redirect(`${config.frontendUrl}/#${new URLSearchParams(params)}`);
}

// --- Discord sign-in -------------------------------------------------------------------------------------

app.get('/auth/discord', (req, res) => {
  // Random value Discord hands back unchanged; checked against this cookie, so nobody can sign someone in
  // to their own account by sending them a link.
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('sadc_state', state, { httpOnly: true, secure: secureCookie, sameSite: 'lax', maxAge: 10 * 60_000, path: '/auth' });
  res.redirect(authorizeUrl({ clientId: config.discordClientId, redirectUri, state }));
});

app.get('/auth/discord/callback', async (req, res) => {
  const expected = /(?:^|;\s*)sadc_state=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
  res.clearCookie('sadc_state', { path: '/auth' });
  if (req.query.error) return backToSite(res, { error: 'Discord sign-in was cancelled.' });
  if (!expected || req.query.state !== expected || typeof req.query.code !== 'string') {
    return backToSite(res, { error: 'Discord sign-in expired. Please try again.' });
  }
  try {
    const user = await fetchUser({ clientId: config.discordClientId, clientSecret: config.discordClientSecret, redirectUri, code: req.query.code });
    backToSite(res, { session: signSession(config.sessionSecret, user, SESSION_DAYS * 86_400) });
  } catch (err) {
    console.error(`[discord] sign-in failed: ${err.message}`);
    backToSite(res, { error: 'Couldn\'t sign in with Discord. Please try again.' });
  }
});

// Requires the website's session token: "Authorization: Bearer <token>".
function signedIn(req, res, next) {
  const user = readSession(config.sessionSecret, req.get('authorization')?.replace(/^Bearer\s+/i, ''));
  if (!user) return fail(res, 401, 'Your Discord sign-in has expired. Connect Discord again.');
  req.user = user;
  next();
}

// --- Website API -----------------------------------------------------------------------------------------

app.get('/api/config', (req, res) => {
  res.json({ app_name: config.appName, collection_name: config.collectionName, min_hold: config.minHold });
});

app.get('/api/me', signedIn, (req, res) => {
  const { exp, ...user } = req.user;
  res.json({ user, link: links.get(user.id) });
});

// The message to sign with the wallet. The time in it makes the signature expire after SIGN_WINDOW_MS.
app.get('/api/message', signedIn, (req, res) => {
  const wallet = String(req.query.wallet || '');
  if (!isAddress(wallet)) return fail(res, 400, 'That isn\'t a valid Solana wallet address.');
  const issuedAt = new Date().toISOString();
  res.json({ message: signText({ appName: config.appName, wallet, discordId: req.user.id, issuedAt }), issued_at: issuedAt });
});

// Why this Discord account and wallet can't be linked together, or null if they can.
function conflict(discordId, wallet) {
  const owner = links.byWallet(wallet);
  if (owner && owner.discord_id !== discordId) return 'This wallet is already linked to another Discord account. Unlink it there first.';
  const mine = links.get(discordId);
  if (mine && mine.wallet !== wallet) return `Your Discord account is already linked to wallet ${short(mine.wallet)}. Unlink it first to link this one.`;
  return null;
}

app.post('/api/verify', signedIn, async (req, res) => {
  const { wallet, issued_at: issuedAt, signature } = req.body ?? {};
  const user = req.user;
  if (!isAddress(wallet)) return fail(res, 400, 'That isn\'t a valid Solana wallet address.');
  const issued = Date.parse(issuedAt);
  if (!issued || issued > Date.now() + 60_000 || Date.now() - issued > SIGN_WINDOW_MS) {
    return fail(res, 400, 'The signature has expired. Click Verify again.');
  }
  const message = signText({ appName: config.appName, wallet, discordId: user.id, issuedAt });
  if (!verifySignature(wallet, message, signature)) {
    return fail(res, 400, 'The wallet signature doesn\'t match this wallet. Click Verify again and sign with the connected wallet.');
  }
  const before = conflict(user.id, wallet);
  if (before) return fail(res, 409, before);

  let held;
  try {
    held = await countHeld({ rpcUrl: config.rpcUrl, owner: wallet, collection: config.collection });
  } catch (err) {
    console.error(`[verify] couldn't check ${wallet}: ${err.message}`);
    return fail(res, 502, 'Couldn\'t check your wallet right now. Please try again in a minute.');
  }
  // Checked again: someone else may have linked this wallet while we were waiting for the RPC.
  const after = conflict(user.id, wallet);
  if (after) return fail(res, 409, after);

  const existing = links.get(user.id);
  const now = new Date().toISOString();
  const holds = held >= config.minHold;
  if (!holds && !existing) {
    const need = config.minHold > 1 ? `at least ${config.minHold} NFTs` : 'an NFT';
    return fail(res, 403, `This wallet doesn't hold ${need} from ${config.collectionName}${held ? ` (found ${held})` : ''}.`);
  }
  const link = {
    discord_id: user.id,
    username: user.username,
    name: user.name,
    wallet,
    held,
    holds,
    linked_at: existing?.linked_at ?? now,
    checked_at: now,
  };
  try {
    await links.set(link);
  } catch (err) {
    console.error(`[verify] couldn't save the link for ${user.id}: ${err.message}`);
    return fail(res, 500, 'Something went wrong saving your link. Please try again.');
  }
  if (!holds) return fail(res, 403, `This wallet no longer holds an NFT from ${config.collectionName}, so the holder role has been removed.`);
  console.log(`[verify] ${user.username} (${user.id}) linked ${wallet}, holds ${held}`);
  res.json({ link });
});

app.post('/api/unlink', signedIn, async (req, res) => {
  const link = links.get(req.user.id);
  if (!link) return res.json({ ok: true });
  try {
    await links.remove(req.user.id);
  } catch (err) {
    console.error(`[unlink] couldn't save for ${req.user.id}: ${err.message}`);
    return fail(res, 500, 'Something went wrong unlinking. Please try again.');
  }
  console.log(`[unlink] ${req.user.username} (${req.user.id}) unlinked ${link.wallet}`);
  res.json({ ok: true });
});

// --- Discord bot -----------------------------------------------------------------------------------------

function botOnly(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!sameSecret(token, config.botSecret)) return fail(res, 401, 'Wrong or missing BOT_SECRET');
  next();
}

// Everyone who should have the holder role, as Discord ids, and how many NFTs each holds:
// { holders: ["123", …], counts: { "123": 4, … } }
app.get('/api/bot/holders', botOnly, (req, res) => {
  res.json(links.snapshot());
});

// The same list, sent straight away and again every time it changes (Server-Sent Events, event "holders").
app.get('/api/bot/stream', botOnly, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (snapshot) => res.write(`event: holders\ndata: ${JSON.stringify(snapshot)}\n\n`);
  send(links.snapshot());
  links.on('holders', send);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(keepAlive);
    links.off('holders', send);
  });
});

// --- Checking linked wallets again -----------------------------------------------------------------------

let lastCheck = null;

// Checks every linked wallet again, one at a time. A wallet the RPC can't check keeps its last result,
// so an outage never takes roles away.
async function recheck() {
  let changed = 0;
  let failed = 0;
  for (const link of links.all()) {
    try {
      const held = await countHeld({ rpcUrl: config.rpcUrl, owner: link.wallet, collection: config.collection });
      const holds = held >= config.minHold;
      if (holds !== link.holds) {
        changed++;
        console.log(`[recheck] ${link.username} (${link.discord_id}) ${holds ? 'holds again' : 'no longer holds'}: ${held} in ${link.wallet}`);
      }
      Object.assign(link, { held, holds, checked_at: new Date().toISOString() });
    } catch (err) {
      failed++;
      if (failed === 1) console.error(`[recheck] couldn't check ${link.wallet}: ${err.message}`);
    }
  }
  try {
    await links.save();
  } catch (err) {
    console.error(`[recheck] couldn't save: ${err.message}`);
  }
  lastCheck = { at: new Date().toISOString(), wallets: links.all().length, changed, failed };
  if (failed) console.error(`[recheck] ${failed} wallet(s) couldn't be checked; they keep their last result`);
}

async function recheckLoop() {
  try {
    await recheck();
  } catch (err) {
    console.error(`[recheck] ${err.stack || err}`);
  }
  setTimeout(recheckLoop, config.recheckMinutes * 60_000).unref();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, links: links.all().length, holders: links.holders().length, last_check: lastCheck });
});

app.use((req, res) => fail(res, 404, 'Not found'));
app.use((err, req, res, next) => {
  const clientError = err.status >= 400 && err.status < 500;
  if (!clientError) console.error(`[api] ${req.method} ${req.path}: ${err.stack || err}`);
  if (res.headersSent) return next(err);
  fail(res, clientError ? err.status : 500, clientError ? 'Bad request' : 'Something went wrong');
});

const server = app.listen(config.port, config.host, () => {
  console.log(`SADC backend listening on http://localhost:${config.port}${config.host === '127.0.0.1' ? ' (this machine only)' : ''}`);
  console.log(`Discord redirect: ${redirectUri} (add this in the Developer Portal under OAuth2 > Redirects)`);
  console.log(`${links.all().length} linked wallet(s) in ${path.join(path.resolve(config.dataDir), 'links.json')}, rechecked every ${config.recheckMinutes} min`);
});
setTimeout(recheckLoop, 30_000).unref(); // first recheck shortly after start, then every RECHECK_MINUTES

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
