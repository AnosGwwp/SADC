# SADC backend

Links a Discord account to a Solana wallet, checks that the wallet holds an NFT from the collection, and gives the Discord bot the list of holders so it can hand out the role.

- **Discord sign-in:** OAuth2 with the `identify` scope only (id, name, avatar).
- **Wallet ownership:** the person signs a short message in their wallet. That proves the wallet is theirs without a transaction or any cost. The message names the wallet and the Discord account and is only valid for 10 minutes, so a signature can't be reused for anything else.
- **NFT check:** the DAS API (`searchAssets`) on your Solana RPC. Normal and compressed NFTs count; burnt ones and unverified collections don't. The count is exact (roles in Discord can depend on it): one request per 1,000 NFTs.
- **One to one:** a wallet can be linked to only one Discord account and a Discord account to only one wallet. To switch, unlink first; that takes the role away.
- **Selling:** every linked wallet is checked again every `RECHECK_MINUTES` (10). A wallet that no longer holds loses the role, and gets it back once it holds again. If the RPC is down, nobody's role changes.
- **Saved:** every link is written to `data/links.json` before the bot is told, so a restart never loses one.

## Setup

1. **Discord app.** In the Developer Portal, open your bot's application (or make a new one) > **OAuth2**. Copy the **Client ID** and **Client Secret**, and under **Redirects** add `PUBLIC_URL/auth/discord/callback`, e.g. `https://sadc.87-76-169-31.sslip.io/auth/discord/callback`. The backend prints the exact address when it starts.
2. **Solana RPC.** Make a free account at [helius.dev](https://helius.dev) and copy your mainnet RPC URL (`https://mainnet.helius-rpc.com/?api-key=…`). Any RPC with the DAS API works.
3. **Collection address.** The collection's on-chain address: on Magic Eden or Tensor it's shown as the collection / "certified collection" address, and on Solscan it's the collection NFT's address shown on any of its NFTs.
4. **`.env`.** `cp .env.example .env` and fill it in. Make `SESSION_SECRET` and `BOT_SECRET` with:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. `npm install`, then `npm start`.

## On the VPS

Same machine as the other backend and the bot, on port 2001, behind Caddy for HTTPS:

```
# /etc/caddy/Caddyfile: add next to the existing block
sadc.87-76-169-31.sslip.io {
    reverse_proxy 127.0.0.1:2001
}
```

```
sudo systemctl reload caddy
git clone https://github.com/AnosGwwp/SADC.git ~/SADC-git     # first time only; later: cd ~/SADC-git && git pull
cd ~/SADC-git/SADC/backend && npm install --omit=dev
# copy your .env into ~/SADC-git/SADC/backend/.env before starting
pm2 start src/server.js --name sadc-backend && pm2 save
```

Keep `HOST=127.0.0.1` so port 2001 is only reachable through Caddy. No firewall change is needed: 443 is already open. In the bot's `.env`, set `SADC_URL=http://127.0.0.1:2001` and `SADC_BOT_SECRET` to the same value as `BOT_SECRET` here.

## API

| | |
| --- | --- |
| `GET /auth/discord` | Sends the person to Discord to sign in, then back to `FRONTEND_URL` with a session token after `#` |
| `GET /api/config` | App and collection name, for the page |
| `GET /api/me` | The signed-in person and their link (or `null`) |
| `GET /api/message?wallet=` | The message to sign with that wallet |
| `POST /api/verify` | `{ wallet, issued_at, signature }` (signature in base64). Links the wallet if everything checks out |
| `POST /api/unlink` | Removes the link; the bot takes the role away |
| `GET /api/bot/stream` | For the bot (`Authorization: Bearer BOT_SECRET`): `{ holders: [Discord ids], counts: { id: NFTs held } }`, sent on connect and whenever someone's holdings change |
| `GET /api/bot/holders` | The same list, once |
| `GET /api/health` | Links, holders and the last recheck |

The website's calls need `Authorization: Bearer <session token>`. Errors come back as `{ "error": "…" }` with a message that can be shown as it is.
