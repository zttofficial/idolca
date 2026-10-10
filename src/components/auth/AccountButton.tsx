"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";
import { Link } from "@/i18n/navigation";
import { getUsdtBalance } from "@/lib/solana/balance";
import { shortAddress } from "@/lib/solana/config";
import { formatUsdt } from "@/lib/fx";
import { openAddCard } from "@/components/binder/AddCard";

// 導航列的登入入口：主按鈕是「登入」；錢包不是註冊的一部分，只在帳戶選單裡以「收藏錢包」出現
export default function AccountButton() {
  const t = useTranslations("Auth");
  const { ready, user, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<{ owner: string; usdt: number | null }>();
  const [copied, setCopied] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const address = user?.walletAddress;

  useEffect(() => {
    if (!address || !open) return;
    let cancelled = false;
    getUsdtBalance(address)
      .then((usdt) => !cancelled && setBalance({ owner: address, usdt }))
      .catch(() => !cancelled && setBalance({ owner: address, usdt: null }));
    return () => {
      cancelled = true;
    };
  }, [address, open]);

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

  const usdt = balance && balance.owner === address ? balance.usdt : undefined;
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
        <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-line bg-surface p-4 text-sm shadow-xl">
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
          </div>

          <div className="mt-2 rounded-xl bg-surface-2 p-3">
            <p className="text-xs font-semibold">{t("walletTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{t(address ? "walletBody" : "custodyBody")}</p>
          </div>
          {address && (
            <div className="mt-2 rounded-xl bg-surface-2 p-3">
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-ink-2">{shortAddress(address, 6, 6)}</span>
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
              <p className="mt-2 flex justify-between text-xs">
                <span className="text-ink-3">{t("balance")}</span>
                <span className="font-semibold tabular-nums">{usdt === undefined ? "…" : usdt === null ? "—" : formatUsdt(usdt, 2)}</span>
              </p>
            </div>
          )}

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
