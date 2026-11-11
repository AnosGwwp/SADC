# SADC website

One page: **Connect Discord**, **Connect wallet**, then **Verify**. Once linked, it shows the linked wallet, whether the holder role is active, and **Check again** / **Unlink wallet**. Errors from the backend (wallet already linked, no NFT, signature cancelled…) are shown under the steps.

Built with Next.js and the Solana wallet adapter. Phantom, Solflare, Backpack and other current wallets show up on their own. Ledger wallets can't sign messages, so people using one need to connect it through Phantom or Solflare's normal (non-Ledger) account. On phones, people open the page inside their wallet app's browser (Phantom > browser icon); on Android the Mobile Wallet Adapter also works in Chrome.

## Run it

```
cp .env.example .env     # set NEXT_PUBLIC_API_URL to the SADC backend
npm install
npm run dev              # http://localhost:2000
```

The backend's `FRONTEND_URL` must be this site's address, so Discord sends people back here.

## Publish it

`npm run build` makes plain files in `out/`. Any static host works:

- **Netlify:** base directory `SADC/frontend`. The build command and publish directory come from `netlify.toml`. Add `NEXT_PUBLIC_API_URL` under environment variables, plus `SECRETS_SCAN_OMIT_KEYS=NEXT_PUBLIC_API_URL` so Netlify's secret scan doesn't block the deploy (the address is public on purpose).
- **The VPS:** copy `out/` there and serve it from Caddy with `file_server`.

Then set the backend's `FRONTEND_URL` to the published address and restart it.
