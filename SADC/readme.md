SADC = SOLANA AND DISCORD CONNECTER

Description = in this folder we are going to make a website/ project which will connect a person's discord and also a solana wallet of his liking, website will check wheater that person holds an NFT of a specific collection if he holds the NFT then it will send the data to discord bot and will save his information in a json, then in discord bot will give him a specific role, if he sell's the NFT bot wil remove the role

work flow: in SADC/frontend we'll make the website where person will connect the wallet and discord, if both are properly connected, a button called "Verify" will appear, on clicking the button website will send the data to SADC/backend to make sure if both of the data are connected and are not already connected with some other accounts so people can't use same discord and wallet with other accounts and abouse the system, they can indeed unlink the accounts and link another one but will lose the role in unlinked one, if all the data are properly Backend will give the information to ../../DiscordBot and bot will grant the role and if data are problematic website will show error

## How it's built

```
frontend/   the website (Next.js): Connect Discord, Connect wallet, Verify / Unlink
backend/    Discord sign-in, wallet signature check, NFT check, data/links.json, holder list for the bot
../DiscordBot/holders.py   gives and takes the holder role, following the backend's list
```

1. **Connect Discord** signs in through Discord (backend `/auth/discord`).
2. **Connect wallet** opens the wallet picker (Phantom, Solflare, Backpack…).
3. **Verify** asks the wallet to sign a message (free, no transaction). The backend checks the signature, that neither account is linked elsewhere, and that the wallet holds the NFT. Then it saves the link to `backend/data/links.json` and the bot gives the role within seconds.
4. **Unlink** removes the link; the bot takes the role away. They can then link another wallet.
5. Every 10 minutes the backend checks every linked wallet again. If someone sold, the bot takes the role away (and gives it back if they buy again).

## Setup

1. Backend: see [backend/README.md](backend/README.md) (Discord OAuth, Helius RPC key, collection address, Caddy on the VPS).
2. Website: see [frontend/README.md](frontend/README.md).
3. Bot: set `SADC_URL` and `SADC_BOT_SECRET` in `DiscordBot/.env`, restart it, then `/holdersetup role:@Holder` (see the "Holder role" part of `DiscordBot/README.md`).