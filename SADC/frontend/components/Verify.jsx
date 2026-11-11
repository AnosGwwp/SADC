"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { API_URL, api, session, shortAddress, timeAgo } from "@/lib/api";

// Signatures come back as bytes; the backend expects base64.
const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes));

// The three steps: connect Discord, connect a wallet, verify. Once linked, step 3 shows the link
// with "Check again" and "Unlink".
export default function Verify() {
  const { publicKey, wallet, signMessage, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [me, setMe] = useState(undefined); // undefined while loading, null when not signed in to Discord
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(null); // "verify" | "unlink" while waiting
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const address = publicKey?.toBase58();
  const link = me?.link ?? null;
  const collection = config?.collection_name || "the collection";

  useEffect(() => {
    // Back from Discord sign-in: the backend put the token (or an error) after "#". Remove it from the address bar.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("session")) session.set(hash.get("session"));
    if (hash.has("error")) setError(hash.get("error"));
    if (hash.has("session") || hash.has("error")) history.replaceState(null, "", window.location.pathname + window.location.search);

    api("/api/config").then(setConfig).catch(() => {});
    if (!session.get()) {
      setMe(null);
      return;
    }
    api("/api/me")
      .then(setMe)
      .catch((err) => {
        if (err.status === 401) session.set(null);
        else setError(err.message);
        setMe(null);
      });
  }, []);

  function signOut() {
    session.set(null);
    setMe(null);
    setError(null);
    setSuccess(null);
  }

  // 401 means the Discord sign-in expired: show the Connect Discord button again.
  function handle(err) {
    if (err.status === 401) signOut();
    setError(err.message);
  }

  async function verify() {
    setError(null);
    setSuccess(null);
    if (!signMessage) {
      setError(`${wallet?.adapter.name || "This wallet"} can't sign messages. Try Phantom, Solflare or Backpack.`);
      return;
    }
    setBusy("verify");
    try {
      const { message, issued_at } = await api(`/api/message?wallet=${address}`);
      let signature;
      try {
        signature = await signMessage(new TextEncoder().encode(message));
      } catch {
        throw new Error("The signature was cancelled in your wallet. Click Verify and approve it to continue.");
      }
      const result = await api("/api/verify", { method: "POST", body: { wallet: address, issued_at, signature: toBase64(signature) } });
      setMe((m) => ({ ...m, link: result.link }));
      setSuccess("Verified! The bot gives you the holder role in Discord within a few seconds.");
    } catch (err) {
      // "No longer holds" also updates the saved link, so fetch it again to show that.
      if (err.status === 403) api("/api/me").then(setMe).catch(() => {});
      handle(err);
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    if (!window.confirm(`Unlink wallet ${shortAddress(link.wallet)}? You'll lose the holder role in Discord.`)) return;
    setError(null);
    setSuccess(null);
    setBusy("unlink");
    try {
      await api("/api/unlink", { method: "POST" });
      setMe((m) => ({ ...m, link: null }));
      setSuccess("Unlinked. The holder role is removed in Discord within a few seconds. You can link another wallet now.");
    } catch (err) {
      handle(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="page">
      <section className="card" aria-labelledby="title">
        <header className="head">
          <span className="eyebrow">{config?.app_name || "Holder"} verification</span>
          <h1 id="title">Get your holder role</h1>
          <p className="lead">
            Connect your Discord and the Solana wallet holding your {collection} NFT, then verify.
            Signing is free and doesn&apos;t send a transaction.
          </p>
        </header>

        <ol className="steps">
          <Step n={1} title="Discord" done={Boolean(me)}>
            {me === undefined ? (
              <span className="muted">Checking…</span>
            ) : me ? (
              <Account image={me.user.avatar} round name={me.user.name} detail={`@${me.user.username}`} action={<button type="button" className="text-btn" onClick={signOut}>Sign out</button>} />
            ) : (
              <a className="btn btn-discord" href={API_URL ? `${API_URL}/auth/discord` : undefined} aria-disabled={!API_URL}>
                <DiscordIcon /> Connect Discord
              </a>
            )}
          </Step>

          <Step n={2} title="Wallet" done={Boolean(address)}>
            {address ? (
              <Account image={wallet?.adapter.icon} name={wallet?.adapter.name || "Wallet"} detail={shortAddress(address)} mono action={<button type="button" className="text-btn" onClick={() => disconnect()}>Disconnect</button>} />
            ) : (
              <button type="button" className="btn" onClick={() => setVisible(true)} disabled={connecting}>
                {connecting ? "Connecting…" : "Connect wallet"}
              </button>
            )}
          </Step>

          <Step n={3} title="Verify" done={Boolean(link?.holds && link.wallet === address)} last>
            {link ? (
              <div className="linked">
                <div className="linked-row">
                  <div>
                    <div className="label">Linked wallet</div>
                    <div className="mono">{shortAddress(link.wallet)}</div>
                  </div>
                  <span className={`pill ${link.holds ? "pill-ok" : "pill-warn"}`}>{link.holds ? "Holder role active" : "No NFT found"}</span>
                </div>
                <p className="muted small">
                  {link.holds
                    ? `Holds ${link.held} from ${collection}. Checked ${timeAgo(link.checked_at)}; wallets are checked again every few minutes.`
                    : `This wallet no longer holds an NFT from ${collection}, so the role was removed. It comes back at the next check once the wallet holds one again.`}
                </p>
                {address && address !== link.wallet && (
                  <p className="note small">The connected wallet ({shortAddress(address)}) isn&apos;t the linked one. Unlink to link it instead.</p>
                )}
                <div className="actions">
                  {address === link.wallet && (
                    <button type="button" className="btn" onClick={verify} disabled={Boolean(busy)}>
                      {busy === "verify" ? "Checking…" : "Check again"}
                    </button>
                  )}
                  <button type="button" className="btn btn-danger" onClick={unlink} disabled={Boolean(busy)}>
                    {busy === "unlink" ? "Unlinking…" : "Unlink wallet"}
                  </button>
                </div>
              </div>
            ) : me && address ? (
              <button type="button" className="btn btn-primary" onClick={verify} disabled={Boolean(busy)}>
                {busy === "verify" ? "Check your wallet…" : "Verify"}
              </button>
            ) : (
              <span className="muted">Connect Discord and a wallet first.</span>
            )}
          </Step>
        </ol>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {success && <p className="alert alert-ok" role="status">{success}</p>}
      </section>

      <p className="foot">
        One wallet per Discord account, and one Discord account per wallet. Selling the NFT or unlinking removes the role.
      </p>
    </main>
  );
}

function Step({ n, title, done, last, children }) {
  return (
    <li className={`step${done ? " step-done" : ""}${last ? " step-last" : ""}`}>
      <span className="step-mark" aria-hidden="true">{done ? <CheckIcon /> : n}</span>
      <div className="step-body">
        <h2 className="step-title">
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h2>
        {children}
      </div>
    </li>
  );
}

function Account({ image, round, name, detail, mono, action }) {
  return (
    <div className="account">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" width="36" height="36" className={round ? "avatar round" : "avatar"} />
      ) : (
        <span className={round ? "avatar round" : "avatar"} aria-hidden="true" />
      )}
      <div className="account-text">
        <div className="account-name">{name}</div>
        <div className={mono ? "muted small mono" : "muted small"}>{detail}</div>
      </div>
      {action}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2.1c-.7-.3-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1L18 21a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.7-13.6zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z" />
    </svg>
  );
}
