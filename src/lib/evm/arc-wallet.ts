"use client";

// 瀏覽器裡的 EVM 錢包（MetaMask、Rabby、Coinbase Wallet 等），只用來在 Arc 上付款：
// 用 EIP-6963 偵測已安裝的錢包，不經過第三方服務；付款是簽一個 USDC 的授權轉帳（EIP-712），
// 不發交易、不付手續費，簽好交給伺服器代送
import { useSyncExternalStore } from "react";
import { ARC, arcTypedData, type ArcPaymentRequest } from "@/lib/arc";

type Eip1193 = { request: (args: { method: string; params?: unknown }) => Promise<unknown> };
export type EvmWallet = { id: string; name: string; icon: string; provider: Eip1193 };
type Announce = CustomEvent<{ info: { uuid: string; name: string; icon: string; rdns: string }; provider: Eip1193 }>;

const EMPTY: EvmWallet[] = [];
let wallets: EvmWallet[] = EMPTY;
const listeners = new Set<() => void>();
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (e) => {
    const { info, provider } = (e as Announce).detail;
    if (wallets.some((w) => w.id === info.rdns)) return;
    wallets = [...wallets, { id: info.rdns, name: info.name, icon: info.icon, provider }];
    listeners.forEach((l) => l());
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function subscribe(l: () => void) {
  listen();
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useEvmWallets = () =>
  useSyncExternalStore(
    subscribe,
    () => wallets,
    () => EMPTY,
  );

export class ArcWalletError extends Error {}

// 錢包切到 Arc；還沒加過這條鏈就先加（手續費幣種是 USDC，原生 18 位小數）
async function switchToArc(provider: Eip1193) {
  const chainId = `0x${ARC!.chainId.toString(16)}`;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    if ((err as { code?: number }).code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId, chainName: ARC!.name, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: [ARC!.rpc], blockExplorerUrls: [ARC!.explorer] }],
    });
  }
}

// 讓買家簽伺服器給的付款授權，回傳付款地址、簽名和授權有效期（伺服器核對用）
export async function signArcPayment(wallet: EvmWallet, request: ArcPaymentRequest) {
  if (!ARC) throw new ArcWalletError("arc_not_configured");
  const provider = wallet.provider;
  let from: `0x${string}`;
  let signature: string;
  try {
    [from] = (await provider.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
    await switchToArc(provider);
    const typed = arcTypedData(from, request);
    const payload = {
      ...typed,
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        ...typed.types,
      },
    };
    signature = (await provider.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify(payload)] })) as string;
  } catch (err) {
    throw new ArcWalletError((err as { code?: number }).code === 4001 ? "rejected" : "wallet_failed");
  }
  return { from, signature, validBefore: request.validBefore };
}

// 錢包目前在本站可用的地址：prompt 為 false 時只讀已授權的帳號（不彈窗），true 時請求連線
export async function evmAddress(wallet: EvmWallet, prompt: boolean): Promise<`0x${string}` | null> {
  try {
    const accounts = (await wallet.provider.request({ method: prompt ? "eth_requestAccounts" : "eth_accounts" })) as `0x${string}`[];
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}
