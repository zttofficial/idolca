"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Wallet } from "@wallet-standard/base";
import type { AuthUser } from "./AuthContext";
import Wordmark from "@/components/brand/Wordmark";
import { Link } from "@/i18n/navigation";
import { WalletError, signInWithWallet, useWallets } from "@/lib/solana/wallets";

type Mode = "signup" | "login";
type ErrorCode = "invalid_email" | "weak_password" | "email_taken" | "invalid_credentials" | "not_configured" | "network";

// 兩種登入方式並列：郵箱 + 密碼給不懂加密的粉絲，錢包簽名給已有 Solana 錢包的人。帳號都存在我們自己的資料庫
export default function AccountModal({ configured, onClose, onSignedIn }: { configured: boolean; onClose: () => void; onSignedIn: (user: AuthUser) => void }) {
  const t = useTranslations("Auth");
  const [mode, setMode] = useState<Mode>("signup");
  // 兩種登入方式分頁切換，彈窗高度減半；不懂加密的粉絲是多數，預設郵箱
  const [method, setMethod] = useState<"email" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // 彈窗打開時鎖住背後的頁面，滾輪只捲彈窗
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      root.style.overflow = before;
    };
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, displayName } : { email, password }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: ErrorCode };
      if (data.user) onSignedIn(data.user);
      else setError(data.error ?? "network");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const input = "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-ink disabled:opacity-50";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(mode === "signup" ? "signupTitle" : "loginTitle")}
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* 視窗矮時整個彈窗可以捲動，不會被切掉 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between">
            <Wordmark className="pt-1 text-2xl" />
            <button onClick={onClose} className="rounded-full px-2 py-1 text-xs text-ink-3 hover:bg-surface-2 hover:text-ink">
              {t("close")}
            </button>
          </div>

          <h2 className="mt-4 text-xl font-bold">{t(mode === "signup" ? "signupTitle" : "loginTitle")}</h2>
          <p className="mt-1 text-sm text-ink-2">{t("subtitle")}</p>

          {!configured && <p className="mt-4 rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-ink">{t("notConfigured")}</p>}

          <div role="tablist" className="mt-5 grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
            {(["email", "wallet"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={method === m}
                onClick={() => setMethod(m)}
                className={`rounded-lg py-2 transition ${method === m ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
              >
                {t(m === "email" ? "tabEmail" : "tabWallet")}
              </button>
            ))}
          </div>

          {method === "wallet" ? (
            <WalletLogin configured={configured} onSignedIn={onSignedIn} />
          ) : (
            <>
              <form onSubmit={submit} className="mt-5 space-y-3">
                {mode === "signup" && (
                  <div>
                    <label htmlFor="acc-name" className="text-xs font-medium text-ink-2">
                      {t("nameLabel")}
                    </label>
                    <input
                      ref={first}
                      id="acc-name"
                      autoComplete="nickname"
                      maxLength={40}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("namePlaceholder")}
                      disabled={!configured}
                      className={input}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="acc-email" className="text-xs font-medium text-ink-2">
                    {t("emailLabel")}
                  </label>
                  <input
                    ref={mode === "login" ? first : undefined}
                    id="acc-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    disabled={!configured}
                    className={input}
                  />
                </div>
                <div>
                  <label htmlFor="acc-password" className="text-xs font-medium text-ink-2">
                    {t("passwordLabel")}
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="acc-password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={!configured}
                      className={`${input.replace("mt-1.5 ", "")} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-ink-3 hover:text-ink"
                    >
                      {showPassword ? t("hide") : t("show")}
                    </button>
                  </div>
                  {mode === "signup" && <p className="mt-1 text-[11px] text-ink-3">{t("passwordHint")}</p>}
                </div>

                {error && <p className="text-xs text-down">{t(`error_${error}`)}</p>}

                <button type="submit" disabled={busy || !configured} className="btn-primary w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
                  {busy ? "…" : t(mode === "signup" ? "signupCta" : "loginCta")}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-ink-3">
                {t(mode === "signup" ? "haveAccount" : "noAccount")}{" "}
                <button
                  onClick={() => {
                    setMode(mode === "signup" ? "login" : "signup");
                    setError(undefined);
                  }}
                  className="font-semibold text-accent-ink hover:underline"
                >
                  {t(mode === "signup" ? "switchToLogin" : "switchToSignup")}
                </button>
              </p>
            </>
          )}
          <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-3">
            {t.rich("agree", {
              terms: (chunks) => (
                <Link href="/terms" className="underline hover:text-ink">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link href="/privacy" className="underline hover:text-ink">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

// 已安裝的瀏覽器錢包列在這裡（MetaMask、Phantom、Solflare、Backpack 等支援 Solana 的都會出現）；一個都沒有時連到 Solana 官方的錢包列表
function WalletLogin({ configured, onSignedIn }: { configured: boolean; onSignedIn: (user: AuthUser) => void }) {
  const t = useTranslations("Auth");
  const wallets = useWallets();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const connect = async (wallet: Wallet) => {
    setPending(wallet.name);
    setError(undefined);
    try {
      onSignedIn(await signInWithWallet(wallet));
    } catch (e) {
      setError(e instanceof WalletError && e.message === "rejected" ? "rejected" : "wallet");
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="mt-5">
      <p className="text-xs leading-relaxed text-ink-2">{t("walletLoginHint")}</p>
      {wallets.length ? (
        <div className="mt-3 grid gap-2">
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={() => connect(w)}
              disabled={!configured || pending !== undefined}
              className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 錢包自帶的 data URL 圖示 */}
              <img src={w.icon} alt="" className="h-6 w-6 rounded-md" />
              {w.name}
              {pending === w.name && <span className="ml-auto text-xs text-ink-3">{t("walletSigning")}</span>}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-ink-2">
          {t("noWallet")}{" "}
          <a href="https://solana.com/solana-wallets" target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
            {t("getWallet")}
          </a>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-down">{t(`error_${error}`)}</p>}
    </div>
  );
}
