# SADC: Solana And Discord Connector

A member signs in with Discord, connects a Solana wallet, signs a message to prove ownership, and the backend checks the wallet holds **Ted Trading Club** NFTs. Verified holders go on a list the TakeTheFloor Discord bot follows to give roles by amount (`../../DiscordBot/holders.py`). The user's original spec is `readme.md`. Workspace map: `../../CLAUDE.md`.

Repo: github.com/AnosGwwp/SADC (private). The clone is `SADC-git/`; this project lives in its `SADC/` subfolder.

## Backend (`backend/`, Express 5, Node >= 22, deps: express, cors)

```
src/server.js   config + validation, Discord OAuth routes, /api/* for the site, /api/bot/* for the bot, 10-min recheck loop
src/session.js  HMAC-signed session tokens (SESSION_SECRET), sameSecret() constant-time compare
src/discord.js  OAuth authorize URL + code exchange (scope identify)
src/solana.js   base58, isAddress, signText (the message to sign), Ed25519 verify via node:crypto, countHeld (DAS searchAssets, paged, exact)
src/links.js    data/links.json: one link per Discord id; emits 'holders' snapshot {holders, counts} after saving, only on change
src/limits.js   per-IP rate limit (loopback exempt)
```

- **Sign-in:** `/auth/discord` sets a `sadc_state` cookie and redirects to Discord; the callback checks state, then redirects to `FRONTEND_URL/#session=<token>` (fragment, so it never reaches a server). The site keeps the token in localStorage (per origin) and sends `Authorization: Bearer`. 401 always means "sign in again"; a bad wallet signature is 400.
- **Verify:** `/api/message?wallet=` returns a message with wallet, Discord id and issue time; `/api/verify` rebuilds it, checks the signature, 10-minute window, conflicts (one wallet per Discord account and vice versa; checked again after the RPC call to avoid races), and the holding. Not holding and not linked → 403, nothing saved. Already linked and no longer holding → link kept with `holds: false`, role removed.
- **Recheck:** every `RECHECK_MINUTES` (10) every link is counted again. An RPC error keeps the last result, so an outage never removes roles.
- **Counting:** DAS `searchAssets` with `grouping: ['collection', COLLECTION_ADDRESS]`, `burnt: false`, 1,000 per page until a short page; counts items owned by the wallet whose collection grouping isn't `verified: false`.
- **Bot API:** `/api/bot/stream` (SSE event `holders`, `{ holders: [ids], counts: { id: held } }`) and `/api/bot/holders`, both need `Bearer BOT_SECRET`. Caddy forwards from loopback too, so a secret is required (an IP check wouldn't work).
- `.env`: PORT 2001, HOST 127.0.0.1, PUBLIC_URL, FRONTEND_URL, ALLOWED_ORIGINS, APP_NAME, DISCORD_CLIENT_ID/SECRET, SESSION_SECRET, BOT_SECRET (must differ from SESSION_SECRET), SOLANA_RPC_URL (Helius), COLLECTION_ADDRESS, COLLECTION_NAME, MIN_HOLD, RECHECK_MINUTES, RATE_LIMIT_PER_MIN, DATA_DIR. The local `.env` is set up for local testing (PUBLIC_URL localhost:2001, FRONTEND_URL localhost:2000).

## Frontend (`frontend/`, Next.js 16, static export to `out/`)

- One page: `components/Verify.jsx` (steps Discord → wallet → verify; linked state with Check again / Unlink), `components/Providers.jsx` (wallet adapter; Wallet Standard wallets only, `WALLETS = []`), `lib/api.js` (API_URL, session storage, `api()` helper).
- Share preview: `lib/site.js` (title/description/collection name, `SITE_URL || URL` from Netlify), `app/opengraph-image.js` (ImageResponse, `dynamic = "force-static"` is required for static export). The image is exported without an extension, so `netlify.toml` sets `Content-Type: image/png` for `/opengraph-image`. Icons copied from the main site.
- `netlify.toml` (in `frontend/`, Netlify base directory `SADC/frontend`): build `npm run build`, publish `out`. Netlify env: `NEXT_PUBLIC_API_URL=https://sadc.87-76-169-31.sslip.io`, `SECRETS_SCAN_OMIT_KEYS=NEXT_PUBLIC_API_URL`. Dev server: `npm run dev` on port 2000.

## Live setup

- Backend: VPS `/root/Downloads/SADC-git/SADC/backend`, systemd unit `/etc/systemd/system/sadc-backend.service` (WorkingDirectory there, ExecStart `/root/.nvm/versions/node/v22.23.4/bin/node src/server.js`, Restart=always, enabled). Update: `cd /root/Downloads/SADC-git && git pull && cd SADC/backend && npm install --omit=dev && sudo systemctl restart sadc-backend`. Logs: `journalctl -u sadc-backend -f`. Caddy: `sadc.87-76-169-31.sslip.io { reverse_proxy 127.0.0.1:2001 }`.
- Frontend: Netlify site takethefloorconnector.netlify.app, custom domain **nft.takethefloor.io** added last. At the last check its HTTPS certificate wasn't issued yet, and the VPS `.env` still had `FRONTEND_URL=https://takethefloorconnector.netlify.app`. To switch: set the domain as primary in Netlify and redeploy; on the VPS set `FRONTEND_URL=https://nft.takethefloor.io` and `ALLOWED_ORIGINS=https://takethefloorconnector.netlify.app`, then restart.
- Discord Developer Portal → OAuth2 → Redirects must contain `https://sadc.87-76-169-31.sslip.io/auth/discord/callback` (and `http://localhost:2001/auth/discord/callback` for local tests).
- Bot side: `SADC_URL=http://127.0.0.1:2001` and `SADC_BOT_SECRET` in the bot's `.env`, then `/holderroles add amount:1 role:@Holder` etc.

## Collection facts (checked Nov 2026)

Ted Trading Club, collection `GDACN7dsW9prLAXEEeC74dGXvTZTLQ4hvDA5PAmEhnqA`, Metaplex Core, 1,500 NFTs, none burnt. Listing on Magic Eden moves the NFT into ME's escrow (`1BWutm…` held exactly the 74 listed), so **a listed NFT counts as not held**. The user was told and accepted this. One wallet (`5Juzof…`) holds ~916 (team/treasury or unminted).

## Open items

- End-to-end test with a real Discord account and wallet hasn't been confirmed yet.
- Helius key is "Unrestricted" and appeared in chat: restrict it to the VPS IP 87.76.169.31 in the Helius dashboard (or rotate it).
- The Discord client secret was also shared in chat once; resetting it was suggested.
- Finish the nft.takethefloor.io switch (above).

## Testing

`backend` end-to-end: a scratch script started a fake DAS RPC, generated Ed25519 keypairs, minted session tokens with `signSession`, and checked 29 cases (signatures, expiry, conflicts, unlink, bot stream, RPC outage, selling). It lived in the session scratchpad, not the repo; recreate it if needed. `countHeld` can be run against the real Helius RPC with `node --env-file=.env`.
