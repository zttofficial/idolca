"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "./AuthContext";

// 郵箱帳號還沒驗證信箱：不能賣卡、不能綁錢包。帳號選單、加卡、上架都用這一塊提示，附「重寄驗證信」
export const useNeedsEmailVerify = () => {
  const { user } = useAuth();
  return !!user?.email && !user.emailVerified;
};

export default function VerifyEmailNotice({ className = "" }: { className?: string }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const { user } = useAuth();
  const [state, setState] = useState<"idle" | "busy" | "sent" | "rate_limited" | "error">("idle");
  if (!user?.email) return null;

  const resend = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/auth/verify-email/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) });
      setState(res.ok ? "sent" : res.status === 429 ? "rate_limited" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className={`rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-xs leading-relaxed text-notice-ink ${className}`}>
      <p>{t("verifyNotice", { email: user.email })}</p>
      <p className="mt-1">
        {state === "sent" ? (
          <span className="font-semibold">{t("verifySent")}</span>
        ) : (
          <button type="button" onClick={resend} disabled={state === "busy"} className="font-semibold underline hover:no-underline disabled:opacity-50">
            {state === "busy" ? "…" : t("verifyResend")}
          </button>
        )}
        {(state === "rate_limited" || state === "error") && <span className="ml-2 text-down">{t(state === "rate_limited" ? "error_rate_limited" : "error_network")}</span>}
      </p>
    </div>
  );
}
