"use client";

// 瀏覽器錢包：用 Wallet Standard 偵測 Phantom、Solflare、Backpack 等已安裝的錢包，不經過第三方登入服務
import { useSyncExternalStore } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import type { AuthUser } from "@/components/auth/AuthContext";

type ConnectFeature = { "standard:connect": { connect: () => Promise<{ accounts: readonly WalletAccount[] }> } };

// 能登入的錢包：支援 Solana、能連線、能簽訊息
const usable = (w: Wallet) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features && SolanaSignMessage in w.features;

const EMPTY: Wallet[] = [];
let cache: Wallet[] = EMPTY;

function subscribe(onChange: () => void) {
  const registry = getWallets();
  const refresh = () => {
    cache = registry.get().filter(usable);
    onChange();
  };
  // 訂閱前已註冊的錢包；React 訂閱後會再讀一次快照
  cache = registry.get().filter(usable);
  const offRegister = registry.on("register", refresh);
  const offUnregister = registry.on("unregister", refresh);
  return () => {
    offRegister();
    offUnregister();
  };
}

export const useWallets = () =>
  useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );

export class WalletLoginError extends Error {}

// 連線錢包 → 取伺服器的挑戰訊息 → 錢包簽名 → 伺服器驗簽後開會話
export async function signInWithWallet(wallet: Wallet): Promise<AuthUser> {
  const { accounts } = await (wallet.features as unknown as ConnectFeature)["standard:connect"].connect();
  const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
  if (!account) throw new WalletLoginError("no_account");

  const challenge = (await (
    await fetch("/api/auth/wallet/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address }) })
  ).json()) as { nonce?: string; message?: string; error?: string };
  if (!challenge.nonce || !challenge.message) throw new WalletLoginError(challenge.error ?? "network");

  let signature: Uint8Array;
  try {
    const [out] = await (wallet.features as unknown as SolanaSignMessageFeature)[SolanaSignMessage].signMessage({
      account,
      message: new TextEncoder().encode(challenge.message),
    });
    signature = out.signature;
  } catch {
    throw new WalletLoginError("rejected");
  }

  const res = (await (
    await fetch("/api/auth/wallet/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, nonce: challenge.nonce, signature: btoa(String.fromCharCode(...signature)) }),
    })
  ).json()) as { user?: AuthUser; error?: string };
  if (!res.user) throw new WalletLoginError(res.error ?? "network");
  return res.user;
}
