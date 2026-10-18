"use client";

// Android 手機錢包：用 Solana Mobile Wallet Adapter 協議喚起手機裡的錢包 App（Phantom、Solflare、Backpack 等），註冊成 Wallet Standard 錢包，
// 登入、綁定、付款和瀏覽器錢包走同一套。只用協議本身，界面（權限說明、等待、取消）都在 WalletPicker 裡，不用官方套件自帶的彈窗。
//
// 每次操作是一個「會話」：網頁跳去錢包 App，兩邊透過 ws://localhost 溝通，做完回到網頁。
// - Chrome 只在用戶剛點過畫面時才肯跳去 App，所以一次點擊只能有一個會話：登入時授權、取得挑戰碼、簽名都在同一個會話裡做完（proveOwnership）。
// - 連 localhost 要 Chrome 的「本機網路存取」權限，第一次用時要用戶允許（loopbackPermission）。
// - 跳去哪個錢包 App 由 Android 決定：只裝了一個就直接打開，裝了多個會讓用戶挑；網頁指定不了。
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { getBase58Decoder, getBase58Encoder } from "@solana/kit";
import { WALLET_CHAIN } from "./config";

type Protocol = typeof import("@solana-mobile/mobile-wallet-adapter-protocol");
type MobileWalletApi = Awaited<ReturnType<Protocol["startScenario"]>>["wallet"] extends Promise<infer W> ? W : never;

export const MOBILE_WALLET = "Mobile Wallet Adapter";
// 自訂功能：在同一個會話裡授權、向伺服器要挑戰訊息、簽名
export const PROVE_OWNERSHIP = "idolca:proveOwnership";
export type ProveOwnershipFeature = {
  [PROVE_OWNERSHIP]: { prove: (challenge: (address: string) => Promise<string>) => Promise<{ address: string; signature: Uint8Array }> };
};

export class MobileWalletError extends Error {}

// 只在 Android 的一般瀏覽器裡用；錢包 App 的內建瀏覽器等 WebView 不算（那裡錢包自己會注入）
const WEBVIEW = /(WebView|Version\/.+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+)|; wv\).+(Chrome)\/(\d+)\.(\d+)\.(\d+)\.(\d+))/i;
export const mobileWalletSupported = () => typeof window !== "undefined" && window.isSecureContext && /Android/i.test(navigator.userAgent) && !WEBVIEW.test(navigator.userAgent);

// 協議模組在點擊前就載好：點擊後的等待會吃掉 Chrome 給的跳轉時限
let protocol: Promise<Protocol> | undefined;
const loadProtocol = () => (protocol ??= import("@solana-mobile/mobile-wallet-adapter-protocol"));

// 「本機網路存取」權限：granted 可以直接連；prompt 要先讓 Chrome 問一次；denied 只能讓用戶去網站設定裡打開。
// 不支援這個權限的瀏覽器（較舊的 Chrome）不需要，當作 granted
export async function loopbackPermission(): Promise<PermissionState> {
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      return (await navigator.permissions.query({ name: name as PermissionName })).state;
    } catch {}
  }
  return "granted";
}

// 讓 Chrome 跳出權限詢問（要在點擊裡呼叫），用戶回應後回傳結果
export async function requestLoopbackPermission(): Promise<PermissionState> {
  fetch("http://localhost", { mode: "no-cors" }).catch(() => {});
  for (const name of ["loopback-network", "local-network-access"]) {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      if (status.state !== "prompt") return status.state;
      return await new Promise((resolve) => (status.onchange = () => status.state !== "prompt" && resolve(status.state)));
    } catch {}
  }
  return "granted";
}

// 授權結果存在這台裝置上：重新整理後不用再跳去錢包授權；付款時帶著 auth_token 讓錢包直接認出網站
const STORE = "idolca:mobile-wallet";
type Saved = { authToken: string; address: string };
const load = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "null");
  } catch {
    return null;
  }
};
const save = (saved: Saved | null) => {
  try {
    if (saved) localStorage.setItem(STORE, JSON.stringify(saved));
    else localStorage.removeItem(STORE);
  } catch {}
};

const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base58 = getBase58Decoder();
// 協議裡的地址是公鑰的 base64
const addressBase64 = (address: string) => toBase64(new Uint8Array(getBase58Encoder().encode(address)));
const FEATURES = ["solana:signMessage", "solana:signAndSendTransaction"] as const;
export const mobileAccount = (address: string): WalletAccount => ({
  address,
  publicKey: new Uint8Array(getBase58Encoder().encode(address)),
  chains: [WALLET_CHAIN],
  features: FEATURES,
});

// 協議的錯誤碼換成給用戶看的原因：沒裝錢包、取消、逾時
function reason(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  if (code === "ERROR_WALLET_NOT_FOUND") return "no_mobile_wallet";
  if (code === "ERROR_LOOPBACK_ACCESS_BLOCKED") return "loopback_denied";
  if (code === "ERROR_SESSION_TIMEOUT") return "connect";
  // 協議層的錯誤碼：-1 拒絕授權、-3 拒絕簽名、-4 沒送出；會話中途關掉也當取消
  if (code === -1 || code === -3 || code === "ERROR_SESSION_CLOSED" || code === "ERROR_ASSOCIATION_CANCELLED") return "rejected";
  return err instanceof MobileWalletError ? err.message : "connect";
}

const ICON = ("data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="1.6" stroke-linecap="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  )) as `data:image/svg+xml;base64,${string}`;

class MobileWallet implements Wallet {
  readonly version = "1.0.0" as const;
  readonly name = MOBILE_WALLET;
  readonly icon = ICON;
  readonly chains = [WALLET_CHAIN] as const;
  #accounts: WalletAccount[] = [];
  // 進行中的會話的取消函式
  #cancel: (() => void) | null = null;

  get accounts() {
    return this.#accounts;
  }

  get features() {
    return {
      "standard:connect": { version: "1.0.0", connect: this.#connect },
      "standard:disconnect": { version: "1.0.0", disconnect: this.#disconnect },
      "solana:signMessage": { version: "1.0.0", signMessage: this.#signMessage },
      "solana:signAndSendTransaction": { version: "1.0.0", supportedTransactionVersions: ["legacy", 0], signAndSendTransaction: this.#signAndSend },
      [PROVE_OWNERSHIP]: { prove: this.#prove },
    } as const;
  }

  // 中斷進行中的會話：用戶按取消、關掉清單或換頁時。
  // 協議的 close() 在連上錢包後不會讓還在等的請求失敗，所以另外用一個 promise 讓整個會話以「取消」結束
  cancel() {
    this.#cancel?.();
  }

  #restore() {
    const saved = load();
    this.#accounts = saved ? [mobileAccount(saved.address)] : [];
    return saved;
  }

  // 開一個會話：跳去錢包 App、授權（帶著存過的 auth_token，錢包認得網站就不再問）後交給 fn，做完關掉會話。
  // 存著的授權失效時（錢包裡撤銷過）這次會失敗，清掉它，下次重新授權
  async #session<T>(fn: (wallet: MobileWalletApi, address: string) => Promise<T>): Promise<T> {
    this.cancel();
    let scenario: Awaited<ReturnType<Protocol["startScenario"]>> | undefined;
    let cancelled = false;
    const aborted = new Promise<never>((_, reject) => {
      this.#cancel = () => {
        cancelled = true;
        reject(new MobileWalletError("cancelled"));
      };
    });
    const run = async () => {
      const { startScenario } = await loadProtocol();
      if ((await loopbackPermission()) === "denied") throw new MobileWalletError("loopback_denied");
      scenario = await startScenario();
      if (cancelled) throw new MobileWalletError("cancelled");
      const wallet = await scenario.wallet;
      const saved = load();
      const auth = await wallet
        .authorize({ identity: { name: "Idolca", uri: window.location.origin, icon: "/icon.svg" }, chain: WALLET_CHAIN, auth_token: saved?.authToken })
        .catch((err) => {
          if (saved) save(null);
          throw err;
        });
      const address = base58.decode(fromBase64(auth.accounts[0].address));
      save({ authToken: auth.auth_token, address });
      this.#accounts = [mobileAccount(address)];
      return fn(wallet, address);
    };
    try {
      return await Promise.race([run(), aborted]);
    } catch (err) {
      throw new MobileWalletError(cancelled ? "cancelled" : reason(err));
    } finally {
      this.#cancel = null;
      try {
        scenario?.close();
      } catch {}
    }
  }

  // 靜默連線只讀這台裝置上存著的授權，不跳去錢包
  #connect = async ({ silent }: { silent?: boolean } = {}) => {
    if (this.#restore() || silent) return { accounts: this.accounts };
    await this.#session(async () => undefined);
    return { accounts: this.accounts };
  };

  #disconnect = async () => {
    this.cancel();
    save(null);
    this.#accounts = [];
  };

  #prove = (challenge: (address: string) => Promise<string>) =>
    this.#session(async (wallet, address) => {
      const message = new TextEncoder().encode(await challenge(address));
      const { signed_payloads } = await wallet.signMessages({ addresses: [addressBase64(address)], payloads: [toBase64(message)] });
      // 回傳的是訊息後面接上 64 位元組的簽名
      return { address, signature: fromBase64(signed_payloads[0]).slice(-64) };
    });

  #signMessage = async (...inputs: { account: WalletAccount; message: Uint8Array }[]) =>
    this.#session(async (wallet) => {
      const { signed_payloads } = await wallet.signMessages({ addresses: inputs.map((i) => addressBase64(i.account.address)), payloads: inputs.map((i) => toBase64(i.message)) });
      return signed_payloads.map((p, i) => ({ signedMessage: inputs[i].message, signature: fromBase64(p).slice(-64) }));
    });

  // 付款要用帳號綁的那個地址：錢包裡選了別的帳號就不簽，回報找不到錢包
  #signAndSend = async (...inputs: { account: WalletAccount; transaction: Uint8Array }[]) =>
    this.#session(async (wallet, address) => {
      if (inputs.some((i) => i.account.address !== address)) throw new MobileWalletError("wallet_not_found");
      const { signatures } = await wallet.signAndSendTransactions({ payloads: inputs.map((i) => toBase64(i.transaction)) });
      return signatures.map((s) => ({ signature: fromBase64(s) }));
    });
}

let instance: MobileWallet | null = null;
// 在 Android 上註冊手機錢包，並先載好協議模組；回傳註冊好的錢包（不支援時是 null）
export function mobileWallet(register: (wallet: Wallet) => void): MobileWallet | null {
  if (instance || !mobileWalletSupported()) return instance;
  instance = new MobileWallet();
  void instance.features["standard:connect"].connect({ silent: true });
  void loadProtocol();
  register(instance);
  return instance;
}
