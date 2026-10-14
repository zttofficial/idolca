"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";
import VerifyEmailNotice, { useNeedsEmailVerify } from "./VerifyEmailNotice";
import Dialog from "@/components/ui/Dialog";
import { createCollectionWallet, linkWallet, useWallets } from "@/lib/solana/wallets";
import { privyEnabled } from "@/lib/privy/bridge";
import { track } from "@/lib/analytics";

// 設定錢包：郵箱帳號第一次要付款、收款或做數位珍藏時用。兩個選項——
// 在 Idolca 建一個收藏錢包（Privy 嵌入式錢包，不用安裝、不用助記詞，之後可以刷卡加值），或綁定自己的 Solana 錢包。
// 帳號選單、購買、出價、開卡包、鑄造的「先設定錢包」提示都用這一塊
export function WalletSetupPanel({ onDone }: { onDone?: () => void }) {
  const t = useTranslations("Auth");
  const { user, updateUser } = useAuth();
  const needsVerify = useNeedsEmailVerify();
  const wallets = useWallets();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  if (needsVerify) return <VerifyEmailNotice />;

  const run = async (key: string, go: () => Promise<Parameters<typeof updateUser>[0]>, fallback: "wallet" | "privy") => {
    setPending(key);
    setError(undefined);
    try {
      updateUser(await go());
      track("wallet_linked", { kind: key === "privy" ? "privy" : "external" });
      onDone?.();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(["rejected", "wallet_taken", "email_unverified", "cancelled"].includes(code) ? code : fallback);
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="space-y-3">
      {privyEnabled() && user?.email && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-semibold">{t("collectionWalletTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{t("collectionWalletBody")}</p>
          <button
            disabled={pending !== undefined}
            onClick={() => run("privy", () => createCollectionWallet(user.email!), "privy")}
            className="btn-primary mt-3 w-full rounded-full py-2 text-sm font-semibold disabled:opacity-50"
          >
            {pending === "privy" ? t("collectionWalletBusy") : t("collectionWalletCta")}
          </button>
        </div>
      )}
      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-semibold">{t("ownWalletTitle")}</p>
        {wallets.length ? (
          <div className="mt-2 grid gap-1.5">
            {wallets.map((w) => (
              <button
                key={w.name}
                disabled={pending !== undefined}
                onClick={() => run(w.name, () => linkWallet(w), "wallet")}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自帶的 data URL 圖示 */}
                <img src={w.icon} alt="" className="h-4 w-4 rounded" />
                {w.name}
                {pending === w.name && <span className="ml-auto text-ink-3">{t("walletSigning")}</span>}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-ink-2">
            {t("noWallet")}{" "}
            <a href="https://solana.com/solana-wallets" target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
              {t("getWallet")}
            </a>
          </p>
        )}
      </div>
      {error && <p className="text-xs text-down">{t(`error_${error}`)}</p>}
    </div>
  );
}

export function WalletSetupDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Auth");
  return (
    <Dialog label={t("walletSetupTitle")} onClose={onClose} className="max-w-sm">
      <h2 className="pr-8 text-xl font-bold">{t("walletSetupTitle")}</h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-2">{t("walletSetupBody")}</p>
      <WalletSetupPanel onDone={onClose} />
    </Dialog>
  );
}

// 「先設定錢包才能……」：說明文字加一個打開設定的按鈕
export function GetWalletPrompt({ text, className = "" }: { text: string; className?: string }) {
  const t = useTranslations("Auth");
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-ink-2 ${className}`}>
      <p>{text}</p>
      <button onClick={() => setOpen(true)} className="btn-primary mt-2 rounded-full px-5 py-2 text-sm font-semibold">
        {t("walletSetupTitle")}
      </button>
      {open && <WalletSetupDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

