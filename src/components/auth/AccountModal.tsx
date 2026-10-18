"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import type { Wallet } from "@wallet-standard/base";
import type { AuthUser } from "./AuthContext";
import Wordmark from "@/components/brand/Wordmark";
import { Link } from "@/i18n/navigation";
import { WalletError, signInWithWallet } from "@/lib/solana/wallets";
import WalletPicker from "./WalletPicker";
import { track } from "@/lib/analytics";
import { CloseButton } from "@/components/ui/Dialog";
import InfoTip from "@/components/ui/InfoTip";

type Mode = "signup" | "login" | "forgot";
// 這台裝置上次用哪種方式登入。登入過的人打開彈窗直接是登入頁：預設的註冊表單多一個暱稱欄，密碼管理器會把帳號填進去
const LAST_LOGIN_KEY = "idolca:last-login";
const lastLogin = (): "email" | "wallet" | null => {
  try {
    const v = localStorage.getItem(LAST_LOGIN_KEY);
    return v === "email" || v === "wallet" ? v : null;
  } catch {
    return null;
  }
};
const rememberLogin = (method: "email" | "wallet") => {
  try {
    localStorage.setItem(LAST_LOGIN_KEY, method);
  } catch {}
};

type ErrorCode = "invalid_email" | "weak_password" | "invalid_name" | "reserved_name" | "email_taken" | "invalid_credentials" | "not_configured" | "rate_limited" | "network";

// 兩種登入方式並列：郵箱 + 密碼給不懂加密的粉絲，錢包簽名給已有 Solana 錢包的人。帳號都存在我們自己的資料庫。
// 郵箱這邊另有「忘記密碼」（寄重設連結）；註冊成功後先提示去收驗證信，關掉彈窗才算登入完成
export default function AccountModal({ configured, onClose: dismiss, onSignedIn }: { configured: boolean; onClose: () => void; onSignedIn: (user: AuthUser) => void }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  // 彈窗只在用戶點開後才掛載，初始值可以直接讀 localStorage
  const [mode, setMode] = useState<Mode>(() => (lastLogin() ? "login" : "signup"));
  // 兩種登入方式分頁切換，彈窗高度減半；不懂加密的粉絲是多數，預設郵箱，上次用錢包登入的預設錢包
  const [method, setMethod] = useState<"email" | "wallet">(() => lastLogin() ?? "email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<ErrorCode>();
  const [busy, setBusy] = useState(false);
  // 剛註冊好的帳號：顯示「去收驗證信」，按繼續或關掉時才交給外面
  const [signedUp, setSignedUp] = useState<AuthUser>();
  const [resetSent, setResetSent] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  // 彈窗掛在 body 最前面，郵箱和密碼永遠是頁面上第一、第二個輸入框。Bitwarden 按欄位在頁面上的順序編號，
  // 掃描後頁面別處多了或少了輸入框（導航列搜尋、市場篩選），它拿舊編號填會整體錯位，把密碼填進郵箱欄。
  // 和共用的 Dialog 一樣掛到 body 上，也避開導航列 backdrop-filter 切掉 fixed 定位的問題
  const [host] = useState(() => document.createElement("div"));
  useLayoutEffect(() => {
    document.body.prepend(host);
    return () => host.remove();
  }, [host]);
  const onClose = useCallback(() => (signedUp ? onSignedIn(signedUp) : dismiss()), [signedUp, onSignedIn, dismiss]);

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
      if (mode === "forgot") {
        const res = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, locale }) });
        const data = (await res.json()) as { ok?: boolean; error?: ErrorCode };
        if (data.ok) setResetSent(true);
        else setError(data.error ?? "network");
        return;
      }
      const res = await fetch(`/api/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { email, password, displayName, locale } : { email, password }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: ErrorCode };
      if (data.user) {
        track(mode === "signup" ? "signed_up" : "logged_in", { method: "email" });
        rememberLogin("email");
        if (mode === "signup") setSignedUp(data.user);
        else onSignedIn(data.user);
      } else setError(data.error ?? "network");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const title = signedUp ? "checkInboxTitle" : mode === "signup" ? "signupTitle" : mode === "forgot" ? "forgotTitle" : "loginTitle";
  const switchMode = (m: Mode) => {
    setMode(m);
    setError(undefined);
    setResetSent(false);
  };
  const input = "mt-1.5 w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-ink disabled:opacity-50";

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t(title)} className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm" onClick={onClose}>
      {/* 視窗矮時整個彈窗可以捲動，不會被切掉 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between">
            <Wordmark className="pt-1 text-2xl" />
            <CloseButton onClick={onClose} />
          </div>

          <h2 className="mt-4 text-xl font-bold">{t(title)}</h2>
          {signedUp ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("checkInboxBody", { email: signedUp.email ?? "" })}</p>
              <button onClick={onClose} className="btn-primary mt-5 w-full rounded-xl py-3 text-sm font-semibold">
                {t("continueCta")}
              </button>
            </>
          ) : (
            signInForms()
          )}
        </div>
      </div>
    </div>,
    host,
  );

  // 普通函式不當元件用：每次渲染都是同一棵樹，輸入框不會因為重建而失焦
  function signInForms() {
    return (
      <>
        <p className="mt-1 text-sm text-ink-2">{t(mode === "forgot" ? "forgotBody" : "subtitle")}</p>

        {!configured && <p className="mt-4 rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-xs text-notice-ink">{t("notConfigured")}</p>}

        {/* 忘記密碼只在郵箱這邊，不顯示切換 */}
        {mode !== "forgot" && (
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
        )}

        {method === "wallet" ? (
          <WalletLogin
            configured={configured}
            onSignedIn={(user) => {
              rememberLogin("wallet");
              onSignedIn(user);
            }}
          />
        ) : mode === "forgot" && resetSent ? (
          <>
            <p className="mt-5 rounded-xl bg-surface-2 px-3.5 py-3 text-sm leading-relaxed text-ink-2">{t("resetSentBody", { email })}</p>
            <p className="mt-4 text-center text-xs">
              <button onClick={() => switchMode("login")} className="font-semibold text-accent-ink hover:underline">
                {t("backToLogin")}
              </button>
            </p>
          </>
        ) : (
          <>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div>
                <label htmlFor="acc-email" className="text-xs font-medium text-ink-2">
                  {t("emailLabel")}
                </label>
                <input
                  ref={first}
                  id="acc-email"
                  name="email"
                  type="email"
                  required
                  // 郵箱就是登入帳號：標成 username，密碼管理器才會把它和密碼存成一組、填回這一欄
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={!configured}
                  className={input}
                />
              </div>
              {mode !== "forgot" && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="acc-password" className="text-xs font-medium text-ink-2">
                      {t("passwordLabel")}
                    </label>
                    {mode === "login" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-semibold text-ink-3 hover:text-ink">
                        {t("forgotLink")}
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="acc-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={!configured}
                      className={`${input.replace("mt-1.5 ", "")} pr-16`}
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-ink-3 hover:text-ink">
                      {showPassword ? t("hide") : t("show")}
                    </button>
                  </div>
                  {mode === "signup" && <p className="mt-1 text-[11px] text-ink-3">{t("passwordHint")}</p>}
                </div>
              )}
              {/* 暱稱放在密碼後面：註冊、登入切換時郵箱和密碼的位置不變（見上方 host 的說明） */}
              {mode === "signup" && (
                <div>
                  <label htmlFor="acc-name" className="text-xs font-medium text-ink-2">
                    {t("nameLabel")}
                  </label>
                  <input
                    id="acc-name"
                    name="nickname"
                    autoComplete="nickname"
                    maxLength={24}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("namePlaceholder")}
                    disabled={!configured}
                    className={input}
                  />
                </div>
              )}

              {error && <p className="text-xs text-down">{t(`error_${error}`)}</p>}

              <button type="submit" disabled={busy || !configured} className="btn-primary w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
                {busy ? "…" : t(mode === "signup" ? "signupCta" : mode === "forgot" ? "forgotCta" : "loginCta")}
              </button>
            </form>

            {mode === "forgot" ? (
              <p className="mt-4 text-center text-xs">
                <button onClick={() => switchMode("login")} className="font-semibold text-accent-ink hover:underline">
                  {t("backToLogin")}
                </button>
              </p>
            ) : (
              <p className="mt-4 text-center text-xs text-ink-3">
                {t(mode === "signup" ? "haveAccount" : "noAccount")}{" "}
                <button onClick={() => switchMode(mode === "signup" ? "login" : "signup")} className="font-semibold text-accent-ink hover:underline">
                  {t(mode === "signup" ? "switchToLogin" : "switchToSignup")}
                </button>
              </p>
            )}
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
      </>
    );
  }
}

// 錢包登入：挑一個錢包簽名，清單見 WalletPicker
function WalletLogin({ configured, onSignedIn }: { configured: boolean; onSignedIn: (user: AuthUser) => void }) {
  const t = useTranslations("Auth");
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();

  const connect = async (wallet: Wallet) => {
    setPending(wallet.name);
    setError(undefined);
    try {
      const user = await signInWithWallet(wallet);
      track("logged_in", { method: "wallet" });
      onSignedIn(user);
    } catch (e) {
      const code = e instanceof WalletError ? e.message : "";
      // 用戶自己按了取消就不顯示錯誤
      if (code !== "cancelled") setError(["rejected", "no_mobile_wallet", "loopback_denied", "connect"].includes(code) ? code : "wallet");
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="mt-5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {t("walletLoginTitle")}
        <InfoTip text={t("walletLoginHint")} label={t("walletLoginTitle")} align="start" />
      </p>
      <WalletPicker pending={pending} disabled={!configured} onPick={connect} />
      {error && <p className="mt-2 text-xs text-down">{t(`error_${error}`)}</p>}
    </div>
  );
}
