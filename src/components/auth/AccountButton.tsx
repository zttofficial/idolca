"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";
import { Link } from "@/i18n/navigation";
import { CLUSTER, shortAddress, solscanUrl } from "@/lib/solana/config";
import { formatUsdt } from "@/lib/fx";
import { openAddCard } from "@/components/binder/AddCard";
import { ChainError, claimFaucet, useBalance } from "@/lib/chain-client";
import { WalletError, linkWallet, useWallets } from "@/lib/solana/wallets";

// 導航列的帳號入口：登入後的選單裡有收藏冊、上鏈，以及錢包（郵箱帳號可以在這裡綁定錢包）
export default function AccountButton() {
  const t = useTranslations("Auth");
  const { ready, user, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!ready) {
    return <span className="h-9 w-20 animate-pulse rounded-full bg-surface-2" aria-hidden />;
  }

  if (!user) {
    return (
      <button onClick={login} className="btn-primary rounded-full px-5 py-2 text-sm font-semibold">
        {t("login")}
      </button>
    );
  }

  const initial = user.displayName.slice(0, 1).toUpperCase();

  return (
    <div className="relative" ref={menu}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-line py-1 pr-3 pl-1 text-sm font-medium hover:bg-surface-2"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{initial}</span>
        <span className="hidden max-w-28 truncate sm:inline">{user.displayName}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-line bg-surface p-4 text-sm shadow-xl">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink">{initial}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-ink-3">{user.email ?? t("walletAccount")}</p>
            </div>
          </div>
          <div className="mt-3 space-y-0.5">
            <Link href="/binder" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 font-medium hover:bg-surface-2">
              {t("myBinder")}
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                openAddCard();
              }}
              className="block w-full rounded-xl px-3 py-2 text-left font-medium hover:bg-surface-2"
            >
              {t("addCard")}
            </button>
            {user.isAdmin && (
              <Link href="/admin" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 font-medium hover:bg-surface-2">
                {t("admin")}
              </Link>
            )}
          </div>

          {user.walletAddress ? <WalletBox address={user.walletAddress} /> : <LinkWalletBox />}

          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="mt-3 w-full rounded-xl border border-line py-2 text-xs font-semibold text-ink-2 hover:bg-surface-2"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

// 已有錢包：地址、devnet 餘額、領測試幣
function WalletBox({ address }: { address: string }) {
  const t = useTranslations("Auth");
  const { balance, refresh } = useBalance(address);
  const [copied, setCopied] = useState(false);
  const [faucet, setFaucet] = useState<"idle" | "busy" | "done" | "cooldown" | "error">("idle");

  const claim = async () => {
    setFaucet("busy");
    try {
      await claimFaucet();
      await refresh();
      setFaucet("done");
    } catch (e) {
      setFaucet(e instanceof ChainError && e.message === "cooldown" ? "cooldown" : "error");
    }
  };

  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <p className="text-xs font-semibold">{t("walletTitle")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{t("walletBody")}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <a href={solscanUrl("account", address)} target="_blank" rel="noreferrer" className="font-mono text-xs text-ink-2 hover:text-ink">
          {shortAddress(address, 6, 6)}
        </a>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
          className="text-[11px] font-semibold text-ink-2 hover:text-ink"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface px-2.5 py-1.5">
          <dt className="text-ink-3">{CLUSTER === "devnet" ? t("testUsdt") : "USDT"}</dt>
          <dd className="font-semibold tabular-nums">{balance ? formatUsdt(balance.usdt) : "…"}</dd>
        </div>
        <div className="rounded-lg bg-surface px-2.5 py-1.5">
          <dt className="text-ink-3">{CLUSTER === "devnet" ? "devnet SOL" : "SOL"}</dt>
          <dd className="font-semibold tabular-nums">{balance ? balance.sol.toFixed(3) : "…"}</dd>
        </div>
      </dl>
      {/* 測試幣只在 devnet 有 */}
      {CLUSTER === "devnet" && (
        <button onClick={claim} disabled={faucet === "busy"} className="mt-2 w-full rounded-lg border border-line bg-surface py-1.5 text-xs font-semibold hover:bg-surface-3 disabled:opacity-50">
          {faucet === "busy" ? t("faucetBusy") : t("faucet")}
        </button>
      )}
      {faucet !== "idle" && faucet !== "busy" && <p className={`mt-1.5 text-[11px] ${faucet === "done" ? "text-up" : "text-down"}`}>{t(`faucet_${faucet}`)}</p>}
    </div>
  );
}

// 郵箱帳號：綁定瀏覽器錢包後才能買賣
function LinkWalletBox() {
  const t = useTranslations("Auth");
  const { updateUser } = useAuth();
  const wallets = useWallets();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  return (
    <div className="mt-2 rounded-xl bg-surface-2 p-3">
      <p className="text-xs font-semibold">{t("linkTitle")}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{t("linkBody")}</p>
      {wallets.length ? (
        <div className="mt-2 grid gap-1.5">
          {wallets.map((w) => (
            <button
              key={w.name}
              disabled={pending !== undefined}
              onClick={async () => {
                setPending(w.name);
                setError(undefined);
                try {
                  updateUser(await linkWallet(w));
                } catch (e) {
                  setError(e instanceof WalletError && ["rejected", "wallet_taken"].includes(e.message) ? e.message : "wallet");
                } finally {
                  setPending(undefined);
                }
              }}
              className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium hover:bg-surface-3 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自帶的 data URL 圖示 */}
              <img src={w.icon} alt="" className="h-4 w-4 rounded" />
              {w.name}
              {pending === w.name && <span className="ml-auto text-ink-3">{t("walletSigning")}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-ink-2">
          {t("noWallet")}{" "}
          <a href="https://phantom.com/download" target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
            {t("installPhantom")}
          </a>
        </p>
      )}
      {error && <p className="mt-1.5 text-[11px] text-down">{t(`error_${error}`)}</p>}
    </div>
  );
}
