"use client";

// 瀏覽器錢包：用 Wallet Standard 偵測 MetaMask、Phantom、Solflare、Backpack 等已安裝、支援 Solana 的錢包，不經過第三方登入服務。
// 登入、綁定錢包都是簽一段文字；買賣則由伺服器組好交易，錢包簽名送出。
// 收藏錢包（Privy 嵌入式錢包）也註冊在 Wallet Standard 裡，綁定和簽名走同一套；只是不出現在讓用戶挑的錢包清單裡。
// 手機瀏覽器裝不了錢包擴充功能：Android 上用 Solana Mobile Wallet Adapter 喚起手機裡的錢包 App，它同樣註冊在 Wallet Standard 裡；
// iOS 沒有這條通道，要在錢包 App 的內建瀏覽器裡打開網站（walletBrowseLinks），那裡錢包會自己注入
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
import { privyAccount, requestPrivy } from "@/lib/privy/bridge";
import { WALLET_CHAIN, rpcUrl } from "./config";

type ConnectFeature = { "standard:connect": { connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }> } };

// 能用的錢包：支援 Solana、能連線、能簽訊息
const usable = (w: Wallet) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features && SolanaSignMessage in w.features;
// 收藏錢包：Privy 的嵌入式錢包
const isCollectionWallet = (w: Wallet) => w.name === "Privy" && "privy:" in w.features;

// Mobile Wallet Adapter 的錢包名稱（套件裡的 SolanaMobileWalletAdapterWalletName），寫死以免為了一個字串把套件打進主程式
export const MOBILE_WALLET = "Mobile Wallet Adapter";

// 只在 Android 上載入並註冊；套件自己會排除錢包 App 的內建瀏覽器等 WebView（那裡錢包已經注入了）。
// 註冊後靜默連線一次：之前授權過的話從快取讀回帳號，不會跳去錢包 App
let mobileWallet: Promise<void> | undefined;
function registerMobileWallet() {
  if (typeof navigator === "undefined" || !/Android/i.test(navigator.userAgent)) return Promise.resolve();
  return (mobileWallet ??= import("@solana-mobile/wallet-standard-mobile")
    .then((mwa) => {
      mwa.registerMwa({
        appIdentity: { name: "Idolca", uri: window.location.origin, icon: "/icon.svg" },
        authorizationCache: mwa.createDefaultAuthorizationCache(),
        chains: [WALLET_CHAIN],
        chainSelector: mwa.createDefaultChainSelector(),
        onWalletNotFound: mwa.createDefaultWalletNotFoundHandler(),
      });
      const wallet = getWallets()
        .get()
        .find((w) => w.name === MOBILE_WALLET);
      if (wallet) return connect(wallet, true).then(() => undefined);
    })
    .catch((err) => console.error("mobile wallet adapter failed", err)));
}

// Android 上的 Chrome 只有在用戶剛點過畫面時才肯跳去錢包 App，而連線和簽名各要跳一次：
// 還沒授權過的手機錢包先點一下連線，回來再點一下簽名
export const needsConnect = (w: Wallet) => w.name === MOBILE_WALLET && !w.accounts.length;
export const connectWallet = (w: Wallet) => connect(w).then(() => undefined);

// 手機（含 iPadOS，它的 UA 自稱 Mac）
export const isMobileBrowser = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

// 在錢包 App 的內建瀏覽器裡打開這一頁（Phantom、Solflare 的 universal link；沒裝 App 時連到下載頁）
export function walletBrowseLinks(url: string) {
  const target = encodeURIComponent(url);
  const ref = encodeURIComponent(new URL(url).origin);
  return [
    { name: "Phantom", href: `https://phantom.app/ul/browse/${target}?ref=${ref}` },
    { name: "Solflare", href: `https://solflare.com/ul/v1/browse/${target}?ref=${ref}` },
  ];
}

const EMPTY: Wallet[] = [];
let cache: Wallet[] = EMPTY;

function subscribe(onChange: () => void) {
  const registry = getWallets();
  // 讓用戶挑的清單（登入、綁定自己的錢包）不列收藏錢包
  const pickable = () => registry.get().filter((w) => usable(w) && !isCollectionWallet(w));
  const refresh = () => {
    cache = pickable();
    onChange();
  };
  // 訂閱前已註冊的錢包；React 訂閱後會再讀一次快照
  cache = pickable();
  void registerMobileWallet();
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
async function proveOwnership(wallet: Wallet, endpoint: string, kind?: "privy"): Promise<AuthUser> {
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
      body: JSON.stringify({ address: account.address, nonce: challenge.nonce, signature: btoa(String.fromCharCode(...signature)), kind }),
    })
  ).json()) as { user?: AuthUser; error?: string };
  if (!res.user) throw new WalletError(res.error ?? "network");
  remember(wallet.name);
  return res.user;
}

export const signInWithWallet = (wallet: Wallet) => proveOwnership(wallet, "/api/auth/wallet/verify");
export const linkWallet = (wallet: Wallet) => proveOwnership(wallet, "/api/auth/wallet/link");

// 建立收藏錢包並綁定到帳號：登入 Privy（寄驗證碼到這個信箱）、沒有錢包就建一個、簽名證明持有後綁定
export async function createCollectionWallet(email: string): Promise<AuthUser> {
  const address = await (await requestPrivy()).wallet({ email, create: true });
  const wallet = getWallets()
    .get()
    .find((w) => isCollectionWallet(w) && w.accounts.some((a) => a.address === address));
  if (!wallet) throw new WalletError("wallet_not_found");
  return proveOwnership(wallet, "/api/auth/wallet/link", "privy");
}

// 找到持有這個地址的錢包：先試上次用的那個，再試其他已安裝的；都需要時會跳出錢包的連線確認
async function walletFor(address: string) {
  await registerMobileWallet();
  const wallets = getWallets()
    .get()
    .filter((w) => usable(w) && (!isCollectionWallet(w) || w.accounts.some((a) => a.address === address)));
  let last = "";
  try {
    last = localStorage.getItem(LAST_WALLET) ?? "";
  } catch {}
  const ordered = [...wallets].sort((a, b) => Number(b.name === last) - Number(a.name === last));
  for (const wallet of ordered) {
    const account = wallet.accounts.find((a) => a.address === address) ?? (await connect(wallet).catch(() => undefined));
    if (account?.address === address) return { wallet, account };
  }
  // 帳號綁的是收藏錢包，這個頁面還沒登入 Privy：先登入（需要時輸入驗證碼），錢包註冊好再找一次
  const me = privyAccount();
  if (me.walletKind === "privy" && me.walletAddress === address && me.email) {
    await (await requestPrivy()).wallet({ email: me.email, create: false });
    const wallet = getWallets()
      .get()
      .find((w) => isCollectionWallet(w) && w.accounts.some((a) => a.address === address));
    const account = wallet?.accounts.find((a) => a.address === address);
    if (wallet && account) return { wallet, account };
  }
  throw new WalletError("wallet_not_found");
}

// 交易編號是交易的第一個簽名，也就是付手續費的平台先簽好的那個。舊版交易格式：[簽名數 (compact-u16)][64 位元組簽名 × n][訊息]
function transactionId(tx: Uint8Array) {
  let i = 0;
  while (tx[i++] & 0x80);
  return getBase58Decoder().decode(tx.slice(i, i + 64));
}

// 簽名並送出伺服器組好的交易（base64），回傳交易編號（base58）。
// 錢包只補上自己的簽名；交易編號直接從交易裡讀，不依賴錢包回傳的是哪一個簽名
export async function signAndSend(txBase64: string, address: string): Promise<string> {
  const { wallet, account } = await walletFor(address);
  const transaction = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
  try {
    if (SolanaSignAndSendTransaction in wallet.features) {
      await (wallet.features as unknown as SolanaSignAndSendTransactionFeature)[SolanaSignAndSendTransaction].signAndSendTransaction({
        account,
        chain: WALLET_CHAIN,
        transaction,
      });
      return transactionId(transaction);
    }
    const [out] = await (wallet.features as unknown as SolanaSignTransactionFeature)[SolanaSignTransaction].signTransaction({ account, chain: WALLET_CHAIN, transaction });
    const res = (await (
      await fetch(rpcUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: [btoa(String.fromCharCode(...out.signedTransaction)), { encoding: "base64" }] }),
      })
    ).json()) as { result?: string; error?: { message: string } };
    if (!res.result) throw new WalletError(res.error?.message ?? "send_failed");
    return res.result;
  } catch (err) {
    if (err instanceof WalletError) throw err;
    // 錢包拒絕或出錯：用戶看到的是「取消了」，原因印在主控台方便查
    console.error("wallet sign failed", err);
    throw new WalletError("rejected");
  }
}
