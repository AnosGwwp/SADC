// Wallet checks: that an address is a real Solana address, that its owner signed our message
// (proving they control the wallet, without a transaction or any cost), and how many NFTs from the
// collection it holds.

import crypto from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Solana addresses are base58. Returns the bytes, or null if it contains characters base58 doesn't use.
export function base58Decode(text) {
  let n = 0n;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) return null;
    n = n * 58n + BigInt(digit);
  }
  const bytes = [];
  for (; n > 0n; n >>= 8n) bytes.unshift(Number(n & 255n));
  // Each leading "1" is a leading zero byte.
  for (const char of text) {
    if (char !== '1') break;
    bytes.unshift(0);
  }
  return Buffer.from(bytes);
}

export function isAddress(text) {
  return typeof text === 'string' && text.length >= 32 && text.length <= 44 && base58Decode(text)?.length === 32;
}

// The text the person signs in their wallet. Rebuilt here from the same parts when they send the signature
// back, so the signature only counts for this wallet, this Discord account and a few minutes.
export function signText({ appName, wallet, discordId, issuedAt }) {
  return [
    `${appName}: link this wallet to your Discord account.`,
    '',
    'Signing only proves you own this wallet. It does not send a transaction or cost anything.',
    '',
    `Wallet: ${wallet}`,
    `Discord account: ${discordId}`,
    `Issued: ${issuedAt}`,
  ].join('\n');
}

// A Solana address is the wallet's Ed25519 public key. Node needs it wrapped in this standard header.
const ED25519_HEADER = Buffer.from('302a300506032b6570032100', 'hex');

// True if `signature` (base64) is the wallet's signature of `message`.
export function verifySignature(wallet, message, signature) {
  const key = base58Decode(wallet);
  const sig = Buffer.from(String(signature || ''), 'base64');
  if (key?.length !== 32 || sig.length !== 64) return false;
  try {
    const publicKey = crypto.createPublicKey({ key: Buffer.concat([ED25519_HEADER, key]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), publicKey, sig);
  } catch {
    return false;
  }
}

const PAGE = 1000; // the most the DAS API returns per page

// How many NFTs from the collection the wallet holds right now, using the DAS API (Helius and most Solana
// RPC providers have it). Counts normal and compressed NFTs; burnt ones and unverified collections don't count.
// Exact, however many they hold, since roles can depend on the amount: one request, plus one per extra 1,000.
// Throws when the RPC can't be reached or answers with an error, so a hiccup is never mistaken for "sold".
export async function countHeld({ rpcUrl, owner, collection }) {
  let count = 0;
  for (let page = 1; ; page++) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sadc',
        method: 'searchAssets',
        params: { ownerAddress: owner, grouping: ['collection', collection], burnt: false, page, limit: PAGE },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Solana RPC answered ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`Solana RPC: ${body.error.message || JSON.stringify(body.error)}`);
    const items = body.result?.items ?? [];
    count += items.filter((item) =>
      item.ownership?.owner === owner &&
      !item.burnt &&
      item.grouping?.some((g) => g.group_key === 'collection' && g.group_value === collection && g.verified !== false),
    ).length;
    if (items.length < PAGE) return count;
  }
}
