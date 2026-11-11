"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Phantom, Solflare, Backpack and other current wallets announce themselves to the page (Wallet Standard),
// so no list of wallets is needed. Kept outside the component so it's the same list on every render.
const WALLETS = [];
// Signing a message doesn't use the network. The wallet library just requires an RPC address.
const ENDPOINT = "https://api.mainnet-beta.solana.com";

export default function Providers({ children }) {
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={WALLETS} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
