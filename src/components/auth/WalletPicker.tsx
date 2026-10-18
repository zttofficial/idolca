"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Wallet } from "@wallet-standard/base";
import { useAuth } from "./AuthContext";
import { cancelMobileWallet, isMobileBrowser, useWallets, walletBrowseLinks } from "@/lib/solana/wallets";
import { MOBILE_WALLET, loopbackPermission, requestLoopbackPermission } from "@/lib/solana/mobile-wallet";

const noop = () => () => {};
const useMobile = () => useSyncExternalStore(noop, isMobileBrowser, () => false);

const ROW = "flex w-full items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

// 錢包清單的一行：圖示、名稱（可帶一行說明）、右邊的狀態
function RowBody({ icon, name, note, status }: { icon: string; name: string; note?: string; status?: ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- 錢包圖示：錢包自帶的 data URL 或 public/wallets 裡的小圖 */}
      <img src={icon} alt="" className="h-7 w-7 shrink-0 rounded-lg" />
      <span className="min-w-0">
        <span className="block">{name}</span>
        {note && <span className="block text-xs font-normal text-ink-3">{note}</span>}
      </span>
      {status && <span className="ml-auto shrink-0 text-xs font-normal text-ink-3">{status}</span>}
    </>
  );
}

// 「在錢包 App 裡打開」：用 Phantom、Solflare 的內建瀏覽器打開這一頁，那裡錢包會自己注入
function WalletAppLinks({ text }: { text: string }) {
  return (
    <div className="mt-4">
      <p className="text-xs leading-relaxed text-ink-2">{text}</p>
      <div className="mt-2 grid gap-2">
        {walletBrowseLinks(window.location.href).map((link) => (
          <a key={link.name} href={link.href} className={ROW}>
            <RowBody icon={link.icon} name={link.name} status="↗" />
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

// 讓用戶挑自己的 Solana 錢包，錢包登入和綁定錢包共用，電腦和手機同一種一行一行的清單。
// 電腦上列出已安裝的瀏覽器錢包；錢包 App 的內建瀏覽器裡列出它注入的錢包；
// Android 的一般瀏覽器裡是「手機上的錢包 App」，加上「在錢包 App 裡打開」；iOS 只有後者。電腦上一個都沒有時連到 Solana 官方的錢包列表。
// 手機錢包第一次用要先允許 Chrome 的「本機網路存取」：說明 → 用戶點繼續觸發 Chrome 的詢問 → 允許後再點一次才跳去錢包（跳轉要用戶剛點過畫面）
export default function WalletPicker({ pending, disabled, onPick }: { pending?: string; disabled?: boolean; onPick: (wallet: Wallet) => void }) {
  const t = useTranslations("Auth");
  const wallets = useWallets();
  const mobile = useMobile();
  const [permission, setPermission] = useState<"ask" | "asking" | "allowed" | "denied">();
  const injected = wallets.filter((w) => w.name !== MOBILE_WALLET);
  const busy = disabled || pending !== undefined || permission === "asking";

  // 離開清單（關掉彈窗、換頁）時中斷還在等錢包回應的會話
  useEffect(() => () => cancelMobileWallet(), []);

  const pick = async (w: Wallet) => {
    if (w.name === MOBILE_WALLET && permission !== "allowed") {
      const state = await loopbackPermission();
      if (state !== "granted") return setPermission(state === "denied" ? "denied" : "ask");
    }
    onPick(w);
  };

  const allow = async () => {
    setPermission("asking");
    setPermission((await requestLoopbackPermission()) === "granted" ? "allowed" : "denied");
  };

  const status = (w: Wallet) => {
    if (pending === w.name)
      return (
        <>
          {t("walletSigning")}
          {w.name === MOBILE_WALLET && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                cancelMobileWallet();
              }}
              className="ml-2 font-semibold text-accent-ink"
            >
              {t("cancel")}
            </button>
          )}
        </>
      );
    if (w.name === MOBILE_WALLET && permission === "allowed") return t("walletAllowed");
    return null;
  };

  return (
    <>
      {wallets.length > 0 && (
        <div className="mt-3 grid gap-2">
          {wallets.map((w) =>
            w.name === MOBILE_WALLET ? (
              // 等待中的那一行要能點「取消」，所以用 div 而不是停用的按鈕
              <div
                key={w.name}
                role="button"
                tabIndex={0}
                aria-disabled={busy}
                onClick={() => !busy && pick(w)}
                onKeyDown={(e) => e.key === "Enter" && !busy && pick(w)}
                className={`${ROW} cursor-pointer ${busy && pending !== w.name ? "opacity-50" : ""}`}
              >
                <RowBody icon={w.icon} name={t("mobileWalletApp")} note={t("mobileWalletNote")} status={status(w)} />
              </div>
            ) : (
              <button key={w.name} onClick={() => pick(w)} disabled={busy} className={ROW}>
                <RowBody icon={w.icon} name={w.name} status={status(w)} />
              </button>
            ),
          )}
        </div>
      )}
      {(permission === "ask" || permission === "asking") && (
        <div className="mt-3 rounded-xl bg-surface-2 px-3.5 py-3 text-xs leading-relaxed text-ink-2">
          <p className="text-sm font-semibold text-ink">{t("loopbackTitle")}</p>
          <p className="mt-1">{t("loopbackBody")}</p>
          <button onClick={allow} disabled={permission === "asking"} className="btn-primary mt-2.5 w-full rounded-full py-2 text-sm font-semibold disabled:opacity-50">
            {t("loopbackContinue")}
          </button>
        </div>
      )}
      {permission === "denied" && <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs leading-relaxed text-ink-2">{t("loopbackDenied")}</p>}
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
