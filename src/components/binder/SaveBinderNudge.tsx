"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import { useBinder } from "@/lib/binder";

// 未登入的訪客勾了卡之後，提醒他建帳號：收藏冊目前只存在這個瀏覽器，登入時會自動併進帳號。
// 已登入或關掉過就不再出現；關掉的紀錄存在 localStorage
const KEY = "idolca:binder-nudge:dismissed";
const listeners = new Set<() => void>();
let hidden = false;

function readDismissed() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // 隱私模式寫不進去：這次瀏覽照樣收起
  }
  hidden = true;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const isDismissed = () => hidden || readDismissed();

export default function SaveBinderNudge() {
  const t = useTranslations("Catalog");
  const { ready, configured, user, login } = useAuth();
  const binder = useBinder();
  // 伺服器端當作已關掉，水合後才依瀏覽器的紀錄顯示
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);
  const marked = Object.keys(binder.have).length > 0 || Object.keys(binder.want).length > 0;
  if (!ready || !configured || user || dismissed || !marked) return null;

  // 手機上按鈕單獨一行，文字和關閉鈕在上面
  return (
    <div className="sticky bottom-4 z-20 mt-6" role="status">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_-12px_rgba(20,10,30,0.35)] sm:flex-nowrap">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink-2">{t("nudgeBody")}</p>
        <button onClick={login} className="btn-primary order-last w-full shrink-0 rounded-full px-5 py-2 text-sm font-semibold sm:order-none sm:w-auto">
          {t("nudgeCta")}
        </button>
        <button
          onClick={dismiss}
          aria-label={t("nudgeDismiss")}
          title={t("nudgeDismiss")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
