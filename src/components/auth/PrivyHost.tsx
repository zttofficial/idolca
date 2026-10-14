"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PrivyProvider, useDepositFunds, useLoginWithEmail, useLogout, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useStandardWallets } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { Wallet, WalletEventsWindow, WindowRegisterWalletEvent, WindowRegisterWalletEventCallback } from "@wallet-standard/base";
import { PRIVY_APP_ID, provideBridge } from "@/lib/privy/bridge";
import { RPC_URL, WALLET_CHAIN } from "@/lib/solana/config";
import Dialog from "@/components/ui/Dialog";

// 收藏錢包的 Privy 端：只在 PrivyMount 掛上時載入。登入 Privy 用它的郵箱驗證碼（帶入用戶在 Idolca 驗證過的信箱，
// 用戶只要輸入 6 位數），不用 Privy 的登入彈窗；Solana 嵌入式錢包只在用戶要時才建。
// 建好的錢包註冊進 Wallet Standard，網站原本的綁定、簽名流程（lib/solana/wallets.ts）照常找得到它
export default function PrivyHost() {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email"],
        appearance: { walletChainType: "solana-only", theme: "light", accentColor: "#e8285a" },
        // 付款前網站的付款面板已經讓用戶確認過金額，不再跳 Privy 自己的簽名確認視窗
        embeddedWallets: { solana: { createOnLogin: "off" }, ethereum: { createOnLogin: "off" }, showWalletUIs: false },
        solana: { rpcs: { [WALLET_CHAIN]: { rpc: createSolanaRpc(RPC_URL), rpcSubscriptions: createSolanaRpcSubscriptions(RPC_URL.replace(/^http/, "ws")) } } },
      }}
    >
      <Bridge />
    </PrivyProvider>
  );
}

type CodePrompt = { email: string; error: boolean; submit: (code: string | null) => void };

function Bridge() {
  const privy = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { logout } = useLogout();
  const { createWallet } = useCreateWallet();
  const { wallets } = useStandardWallets();
  const { depositFunds } = useDepositFunds();
  // 操作介面只交出一次，裡面用 ref 讀最新的狀態和函式
  const live = useRef({ privy, sendCode, loginWithCode, logout, createWallet, wallets, depositFunds });
  useEffect(() => {
    live.current = { privy, sendCode, loginWithCode, logout, createWallet, wallets, depositFunds };
  });
  const [prompt, setPrompt] = useState<CodePrompt | null>(null);

  useEffect(() => {
    const until = async (ok: () => boolean, ms = 30_000) => {
      const t0 = Date.now();
      while (!ok()) {
        if (Date.now() - t0 > ms) throw new Error("privy_timeout");
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const embedded = () => live.current.wallets.find((w) => w.name === "Privy" && "privy:" in w.features);
    const hasSolanaWallet = () =>
      live.current.privy.user?.linkedAccounts.some((a) => a.type === "wallet" && a.walletClientType === "privy" && a.chainType === "solana") ?? false;

    // 寄驗證碼、等用戶輸入；輸錯可以重輸，按取消就丟 cancelled
    const loginByCode = async (email: string) => {
      await live.current.sendCode({ email });
      let error = false;
      for (;;) {
        const code = await new Promise<string | null>((submit) => setPrompt({ email, error, submit }));
        if (code === null) {
          setPrompt(null);
          throw new Error("cancelled");
        }
        try {
          await live.current.loginWithCode({ code });
          setPrompt(null);
          return;
        } catch {
          error = true;
        }
      }
    };

    provideBridge({
      wallet: async ({ email, create }) => {
        await until(() => live.current.privy.ready);
        // 這個瀏覽器上次登入 Privy 的是別的帳號：先登出
        const current = live.current.privy.user?.email?.address?.toLowerCase();
        if (live.current.privy.authenticated && current !== email.toLowerCase()) {
          await live.current.logout();
          await until(() => !live.current.privy.authenticated);
        }
        if (!live.current.privy.authenticated) {
          await loginByCode(email);
          await until(() => live.current.privy.authenticated && Boolean(live.current.privy.user));
        }
        if (!hasSolanaWallet()) {
          if (!create) throw new Error("no_privy_wallet");
          await live.current.createWallet();
        }
        await until(() => Boolean(embedded()));
        const wallet = embedded()!;
        const { accounts } = await (wallet.features["standard:connect"] as { connect: () => Promise<{ accounts: readonly { address: string }[] }> }).connect();
        registerWallet(wallet as unknown as Wallet);
        return accounts[0].address;
      },
      deposit: async (address) => {
        await live.current.depositFunds({ destination: { asset: "usdc", chain: "solana", wallet: address }, fiat: { defaultAmount: "50" } });
      },
    });
  }, []);

  return prompt ? <CodeDialog prompt={prompt} /> : null;
}

// 輸入 Privy 寄來的驗證碼。關掉就是取消。可能在付款途中跳出，所以疊在所有彈窗（付款面板是 z-70）之上
function CodeDialog({ prompt }: { prompt: CodePrompt }) {
  const t = useTranslations("Auth");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    prompt.submit(code.trim());
  };
  return (
    <Dialog label={t("walletCodeTitle")} onClose={() => prompt.submit(null)} className="max-w-sm" layer="z-[90]">
      <form onSubmit={submit}>
        <h2 className="pr-8 text-xl font-bold">{t("walletCodeTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("walletCodeBody", { email: prompt.email })}</p>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, ""));
            setBusy(false);
          }}
          aria-label={t("walletCodeLabel")}
          className="mt-4 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-center text-2xl font-semibold tracking-[0.5em] tabular-nums outline-none focus:border-ink"
        />
        {prompt.error && !busy && <p className="mt-2 text-xs text-down">{t("walletCodeError")}</p>}
        <button type="submit" disabled={code.length !== 6 || busy} className="btn-primary mt-4 w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
          {busy ? "…" : t("walletCodeCta")}
        </button>
      </form>
    </Dialog>
  );
}

// 把 Privy 的嵌入式錢包註冊進 Wallet Standard（照 Privy 文件的寫法，等同 @wallet-standard/wallet 的 registerWallet）
function registerWallet(wallet: Wallet) {
  const callback: WindowRegisterWalletEventCallback = ({ register }) => register(wallet);
  const w = window as WalletEventsWindow;
  w.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { bubbles: false, cancelable: false, detail: callback }) as unknown as WindowRegisterWalletEvent);
  w.addEventListener("wallet-standard:app-ready", ({ detail }) => callback(detail));
}
