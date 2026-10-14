"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth, type AuthUser } from "./AuthContext";

// 郵件連結打開的兩個頁面。令牌在頁面打開後才用 POST 送出：信箱的連結掃描器只會 GET 網址，不會把連結用掉

// 驗證信箱：打開就送出。已登入的話順便更新帳號選單裡的狀態
export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const { user, updateUser } = useAuth();
  const [state, setState] = useState<"busy" | "done" | "invalid">(token ? "busy" : "invalid");
  // 開發模式下 effect 會跑兩次，令牌只能用一次
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    fetch("/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then((r) => setState(r.ok ? "done" : "invalid"))
      .catch(() => setState("invalid"));
  }, [token]);

  useEffect(() => {
    if (state === "done" && user && !user.emailVerified) updateUser({ ...user, emailVerified: true });
  }, [state, user, updateUser]);

  return (
    <Panel title={t(state === "done" ? "verifiedTitle" : state === "busy" ? "verifyingTitle" : "linkInvalidTitle")}>
      {state !== "busy" && <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(state === "done" ? "verifiedBody" : "verifyInvalidBody")}</p>}
      {state !== "busy" && <HomeButton />}
    </Panel>
  );
}

// 重設密碼：填新密碼才送出；成功後這台直接登入，其他裝置登出
export function ResetPassword({ token }: { token: string }) {
  const t = useTranslations("Auth");
  const { updateUser, login } = useAuth();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
  const [error, setError] = useState<"weak_password" | "rate_limited" | "network">();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/auth/password/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (data.user) {
        updateUser(data.user);
        setState("done");
      } else if (data.error === "invalid_token") setState("invalid");
      else setError(data.error === "weak_password" || data.error === "rate_limited" ? data.error : "network");
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  if (state === "invalid") {
    return (
      <Panel title={t("linkInvalidTitle")}>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("resetInvalidBody")}</p>
        <button onClick={login} className="btn-primary mt-6 w-full rounded-xl py-3 text-sm font-semibold">
          {t("login")}
        </button>
      </Panel>
    );
  }
  if (state === "done") {
    return (
      <Panel title={t("resetDoneTitle")}>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("resetDoneBody")}</p>
        <HomeButton />
      </Panel>
    );
  }
  return (
    <Panel title={t("resetTitle")}>
      <form onSubmit={submit} className="mt-5 space-y-3">
        <label htmlFor="reset-password" className="text-xs font-medium text-ink-2">
          {t("newPassword")}
        </label>
        <div className="relative">
          <input
            id="reset-password"
            autoFocus
            type={show ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3.5 py-3 pr-16 text-sm outline-none focus:border-ink"
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-ink-3 hover:text-ink">
            {show ? t("hide") : t("show")}
          </button>
        </div>
        <p className="text-[11px] text-ink-3">{t("passwordHint")}</p>
        {error && <p className="text-xs text-down">{t(`error_${error}`)}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40">
          {busy ? "…" : t("resetCta")}
        </button>
      </form>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

function HomeButton() {
  const t = useTranslations("Auth");
  return (
    <Link href="/" className="btn-primary mt-6 block w-full rounded-xl py-3 text-center text-sm font-semibold">
      {t("continueCta")}
    </Link>
  );
}
