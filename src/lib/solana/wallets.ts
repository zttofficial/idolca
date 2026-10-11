"use client";

// 瀏覽器錢包：用 Wallet Standard 偵測 MetaMask、Phantom、Solflare、Backpack 等已安裝、支援 Solana 的錢包，不經過第三方登入服務。
// 登入、綁定錢包都是簽一段文字；買賣則由伺服器組好交易，錢包簽名送出
import { useSyncExternalStore } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { getBase58Decoder } from "@solana/kit";
import type { AuthUser } from "@/components/auth/AuthContext";
import { RPC_URL, WALLET_CHAIN } from "./config";

type ConnectFeature = { "standard:connect": { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> } };

// 能用的錢包：支援 Solana、能連線、能簽訊息
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

export class WalletError extends Error {}

const LAST_WALLET = "idolca:wallet";
const remember = (name: string) => {
  try {
    localStorage.setItem(LAST_WALLET, name);
  } catch {}
};

async function connect(wallet: Wallet, silent = false) {
  const { accounts } = await (wallet.features as unknown as ConnectFeature)["standard:connect"].connect(silent ? { silent: true } : undefined);
  return accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
}

// 取伺服器的挑戰訊息、讓錢包簽名，再送到 endpoint 驗證：登入用 /api/auth/wallet/verify，綁定用 /api/auth/wallet/link
async function proveOwnership(wallet: Wallet, endpoint: string): Promise<AuthUser> {
  const account = await connect(wallet);
  if (!account) throw new WalletError("no_account");
  const challenge = (await (
    await fetch("/api/auth/wallet/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: account.address }) })
  ).json()) as { nonce?: string; message?: string; error?: string };
  if (!challenge.nonce || !challenge.message) throw new WalletError(challenge.error ?? "network");

  let signature: Uint8Array;
  try {
    const [out] = await (wallet.features as unknown as SolanaSignMessageFeature)[SolanaSignMessage].signMessage({
      account,
      message: new TextEncoder().encode(challenge.message),
    });
    signature = out.signature;
  } catch {
    throw new WalletError("rejected");
  }

  const res = (await (
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address, nonce: challenge.nonce, signature: btoa(String.fromCharCode(...signature)) }),
    })
  ).json()) as { user?: AuthUser; error?: string };
  if (!res.user) throw new WalletError(res.error ?? "network");
  remember(wallet.name);
  return res.user;
}

export const signInWithWallet = (wallet: Wallet) => proveOwnership(wallet, "/api/auth/wallet/verify");
export const linkWallet = (wallet: Wallet) => proveOwnership(wallet, "/api/auth/wallet/link");

// 找到持有這個地址的錢包：先試上次用的那個，再試其他已安裝的；都需要時會跳出錢包的連線確認
async function walletFor(address: string) {
  const wallets = getWallets().get().filter(usable);
  let last = "";
  try {
    last = localStorage.getItem(LAST_WALLET) ?? "";
  } catch {}
  const ordered = [...wallets].sort((a, b) => Number(b.name === last) - Number(a.name === last));
  for (const wallet of ordered) {
    const account = wallet.accounts.find((a) => a.address === address) ?? (await connect(wallet).catch(() => undefined));
    if (account?.address === address) return { wallet, account };
  }
  throw new WalletError("wallet_not_found");
}

// 簽名並送出伺服器組好的交易（base64），回傳交易簽名（base58）
export async function signAndSend(txBase64: string, address: string): Promise<string> {
  const { wallet, account } = await walletFor(address);
  const transaction = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
  try {
    if (SolanaSignAndSendTransaction in wallet.features) {
      const [out] = await (wallet.features as unknown as SolanaSignAndSendTransactionFeature)[SolanaSignAndSendTransaction].signAndSendTransaction({
        account,
        chain: WALLET_CHAIN,
        transaction,
      });
      return getBase58Decoder().decode(out.signature);
    }
    const [out] = await (wallet.features as unknown as SolanaSignTransactionFeature)[SolanaSignTransaction].signTransaction({ account, chain: WALLET_CHAIN, transaction });
    const res = (await (
      await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(String.fromCharCode(...out.signedTransaction)), { encoding: "base64" }] }),
      })
    ).json()) as { result?: string; error?: { message: string } };
    if (!res.result) throw new WalletError(res.error?.message ?? "send_failed");
    return res.result;
  } catch (err) {
    if (err instanceof WalletError) throw err;
    throw new WalletError("rejected");
  }
}
