"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { Wallet } from "@wallet-standard/base";
import { useAuth } from "./AuthContext";
import { MOBILE_WALLET, connectWallet, isMobileBrowser, needsConnect, useWallets, walletBrowseLinks } from "@/lib/solana/wallets";

const noop = () => () => {};
const useMobile = () => useSyncExternalStore(noop, isMobileBrowser, () => false);

// 「在錢包 App 裡打開」：用 Phantom、Solflare 的內建瀏覽器打開這一頁，那裡錢包會自己注入
function WalletAppLinks({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">
      <p>{text}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {walletBrowseLinks(window.location.href).map((link) => (
          <a key={link.name} href={link.href} className="rounded-lg border border-line bg-surface px-3 py-2 text-center text-sm font-semibold text-ink hover:bg-surface-2">
            {link.name}
          </a>
        ))}
      </div>
    </div>
  );
}

// 簽名時找不到帳號綁的錢包（錯誤碼 wallet_not_found）：手機瀏覽器叫不到外部錢包，給「在錢包 App 裡打開」。
// 只在帳號綁的是自己的錢包（收藏錢包在哪都叫得到）、在手機上、且這個瀏覽器沒有注入任何錢包時出現；放在各處付款和簽名的錯誤訊息下面
export function WalletNotFoundHint({ error }: { error?: string | null }) {
  const t = useTranslations("Auth");
  const { user } = useAuth();
  const wallets = useWallets();
  const mobile = useMobile();
  if (error !== "wallet_not_found" || user?.walletKind !== "external" || !mobile || wallets.some((w) => w.name !== MOBILE_WALLET)) return null;
  return <WalletAppLinks text={t("openInWalletAppToPay")} />;
}

// 讓用戶挑自己的 Solana 錢包，錢包登入和綁定錢包共用。
// 電腦上列出已安裝的瀏覽器錢包（MetaMask、Phantom、Solflare、Backpack 等）；手機上另外給「在錢包 App 裡打開」，
// Android 還會多一個「手機上的錢包 App」（Mobile Wallet Adapter）。一個都沒有時連到 Solana 官方的錢包列表
export default function WalletPicker({ pending, disabled, onPick }: { pending?: string; disabled?: boolean; onPick: (wallet: Wallet) => void }) {
  const t = useTranslations("Auth");
  const wallets = useWallets();
  const mobile = useMobile();
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  // 手機錢包連上後要再點一次才簽名；連線改變的是錢包物件本身，用這個觸發重繪
  const [, setConnected] = useState(0);
  const injected = wallets.filter((w) => w.name !== MOBILE_WALLET);

  const pick = async (w: Wallet) => {
    setConnectFailed(false);
    if (!needsConnect(w)) return onPick(w);
    setConnecting(true);
    try {
      await connectWallet(w);
      setConnected((n) => n + 1);
    } catch {
      setConnectFailed(true);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      {wallets.length > 0 && (
        <div className="mt-3 grid gap-2">
          {wallets.map((w) => {
            const mwa = w.name === MOBILE_WALLET;
            const status = pending === w.name ? t("walletSigning") : mwa && connecting ? t("walletConnecting") : mwa && !needsConnect(w) ? t("walletTapToSign") : null;
            return (
              <button
                key={w.name}
                onClick={() => pick(w)}
                disabled={disabled || pending !== undefined || connecting}
                className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自帶的 data URL 圖示 */}
                <img src={w.icon} alt="" className="h-6 w-6 shrink-0 rounded-md" />
                {mwa ? t("mobileWalletApp") : w.name}
                {status && <span className="ml-auto text-xs text-ink-3">{status}</span>}
              </button>
            );
          })}
        </div>
      )}
      {connectFailed && <p className="mt-2 text-xs text-down">{t("error_connect")}</p>}
      {mobile && !injected.length ? (
        <WalletAppLinks text={wallets.length ? t("openInWalletApp") : t("mobileNoWallet")} />
      ) : (
        !wallets.length && (
          <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-ink-2">
            {t("noWallet")}{" "}
            <a href="https://solana.com/solana-wallets" target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
              {t("getWallet")}
            </a>
          </p>
        )
      )}
    </>
  );
}
