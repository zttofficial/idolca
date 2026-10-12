"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";
import { Link } from "@/i18n/navigation";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { formatStable } from "@/lib/fx";
import { openAddCard } from "@/components/binder/AddCard";
import { useBalance } from "@/lib/chain-client";
import CopyButton from "@/components/ui/CopyButton";
import { ARC, arcExplorerUrl } from "@/lib/arc";
import { evmAddress, useEvmWallets } from "@/lib/evm/arc-wallet";
import { WalletError, linkWallet, useWallets } from "@/lib/solana/wallets";
import InfoTip from "@/components/ui/InfoTip";

// 導航列的帳號入口。選單：頭像和暱稱（可以改）、收藏冊和交易的入口、Solana 錢包（地址、餘額；郵箱帳號在這裡綁定錢包）、登出
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
  const close = () => setOpen(false);
  const item = "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left font-medium hover:bg-surface-2";

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
        <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-line bg-surface p-3 text-sm shadow-xl">
          <ProfileHeader />

          <nav className="mt-2 border-t border-line pt-2">
            <Link href="/binder" onClick={close} className={item}>
              {t("myBinder")}
            </Link>
            <Link href="/binder?filter=listed" onClick={close} className={item}>
              {t("forSale")}
            </Link>
            <Link href="/binder?tab=orders" onClick={close} className={item}>
              {t("myOrders")}
            </Link>
            <button
              onClick={() => {
                close();
                openAddCard();
              }}
              className={item}
            >
              {t("addCard")}
            </button>
            {user.isAdmin && (
              <Link href="/admin" onClick={close} className={item}>
                {t("admin")}
              </Link>
            )}
          </nav>

          <div className="mt-2 border-t border-line pt-2">{user.walletAddress ? <WalletBox address={user.walletAddress} /> : <LinkWalletBox />}</div>
          {ARC && (
            <div className="mt-2 border-t border-line pt-2">
              <ArcBalance />
            </div>
          )}

          <button
            onClick={() => {
              close();
              logout();
            }}
            className="mt-2 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            {t("logout")}
          </button>
        </div>
      )}
    </div>
  );
}

// 頭像、暱稱和帳號類型；暱稱可以直接在這裡改（錢包帳號預設是縮寫的地址，買家認不出是誰）
function ProfileHeader() {
  const t = useTranslations("Auth");
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user!.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: name }) });
      const data = (await res.json()) as { user?: NonNullable<typeof user> };
      if (!data.user) throw new Error();
      updateUser(data.user);
      setEditing(false);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 px-1 py-1">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink">{user!.displayName.slice(0, 1).toUpperCase()}</span>
      {editing ? (
        <form onSubmit={save} className="min-w-0 flex-1">
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              aria-label={t("editName")}
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-sm outline-none focus:border-ink"
            />
            <button disabled={busy} className="btn-primary rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50">
              {t("saveName")}
            </button>
          </div>
          <p className={`mt-1 text-[11px] ${error ? "text-down" : "text-ink-3"}`}>{t(error ? "nameError" : "nameHint")}</p>
        </form>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{user!.displayName}</p>
            <button onClick={() => setEditing(true)} className="shrink-0 text-[11px] font-semibold text-ink-3 hover:text-ink">
              {t("editName")}
            </button>
          </div>
          <p className="truncate text-xs text-ink-3">{user!.email ?? t("walletAccount")}</p>
        </div>
      )}
    </div>
  );
}

// Solana 錢包：收卡、付款用的錢包。點地址在區塊瀏覽器打開，右邊可以複製，下面是餘額
function WalletBox({ address }: { address: string }) {
  const t = useTranslations("Auth");
  const { balance } = useBalance(address);
  return (
    <div className="px-3 py-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{t("walletTitle")}</p>
        <CopyButton text={address} label={t("copy")} copiedLabel={t("copied")} className="text-[11px] font-semibold text-ink-3" />
      </div>
      <a href={solscanUrl("account", address)} target="_blank" rel="noreferrer" className="mt-0.5 block font-mono text-xs text-ink-2 hover:text-ink hover:underline">
        {shortAddress(address, 6, 6)}
      </a>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
          <dt className="text-ink-3">USDT</dt>
          <dd className="font-semibold tabular-nums">{balance ? formatStable(balance.usdt, "USDT") : "…"}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 px-2.5 py-1.5">
          <dt className="text-ink-3">SOL</dt>
          <dd className="font-semibold tabular-nums">{balance ? balance.sol.toFixed(3) : "…"}</dd>
        </div>
      </dl>
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
    <div className="px-3 py-1">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        {t("linkTitle")}
        <InfoTip text={t("linkBody")} label={t("linkTitle")} align="start" />
      </p>
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
          <a href="https://solana.com/solana-wallets" target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
            {t("getWallet")}
          </a>
        </p>
      )}
      {error && <p className="mt-1.5 text-[11px] text-down">{t(`error_${error}`)}</p>}
    </div>
  );
}

// Arc 上的 USDC：Arc 付款用的是瀏覽器裡的 EVM 錢包（MetaMask 等），和帳號綁定的 Solana 錢包分開，網站不記它的地址。
// 錢包已經授權過本站就直接讀餘額；沒授權時按「連接錢包查看」才請求連線，不會自己彈窗
function ArcBalance() {
  const t = useTranslations("Auth");
  const wallets = useEvmWallets();
  const [address, setAddress] = useState<string | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const load = async (prompt: boolean) => {
    for (const w of wallets) {
      const a = await evmAddress(w, prompt);
      if (a) {
        setAddress(a);
        const res = await fetch(`/api/chain/arc-balance?address=${a}`);
        if (res.ok) setUsdc(((await res.json()) as { usdc: number }).usdc);
        return;
      }
      if (prompt) return;
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 錢包清單變了就重讀一次已授權的地址和餘額
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只跟著錢包清單重讀
  }, [wallets]);

  return (
    <div className="px-3 py-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{t("arcTitle")}</p>
        {address && <CopyButton text={address} label={t("copy")} copiedLabel={t("copied")} className="text-[11px] font-semibold text-ink-3" />}
      </div>
      {address ? (
        <>
          <a href={arcExplorerUrl("address", address)} target="_blank" rel="noreferrer" className="mt-0.5 block font-mono text-xs text-ink-2 hover:text-ink hover:underline">
            {shortAddress(address, 6, 4)}
          </a>
          <div className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
            <p className="text-ink-3">USDC</p>
            <p className="font-semibold tabular-nums">{usdc === null ? "…" : formatStable(usdc, "USDC")}</p>
          </div>
        </>
      ) : wallets.length ? (
        <button onClick={() => load(true)} className="btn-secondary mt-2 w-full rounded-full py-1.5 text-xs font-semibold">
          {t("arcConnect")}
        </button>
      ) : (
        <p className="mt-1 text-[11px] leading-relaxed text-ink-3">{t("arcNoWallet")}</p>
      )}
    </div>
  );
}
