"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import CopyButton from "@/components/ui/CopyButton";
import InfoTip from "@/components/ui/InfoTip";
import { track } from "@/lib/analytics";
import { localePath } from "@/lib/seo";

type ShareState = { public: boolean; slug: string | null; hidden: string[] };

// 分享狀態整頁共用一份：分享面板和每張卡的「在公開頁顯示」開關讀寫同一份，第一次用到時才讀。記著屬於哪個帳號，換帳號就重讀
type Store = { userId: string; state: ShareState | null; failed: boolean };
let store: Store | null = null;
let loading: string | null = null;
const listeners = new Set<() => void>();
const emit = (next: Store) => {
  store = next;
  listeners.forEach((l) => l());
};

function load(userId: string) {
  if (loading === userId || store?.userId === userId) return;
  loading = userId;
  fetch("/api/binder/share")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((state: ShareState) => emit({ userId, state, failed: false }))
    .catch(() => emit({ userId, state: null, failed: true }))
    .finally(() => {
      loading = null;
    });
}

function useShare(userId: string) {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      load(userId);
      return () => listeners.delete(l);
    },
    () => store,
    () => null,
  );
  return current?.userId === userId ? current : null;
}

async function update(userId: string, body: { public: boolean } | { key: string; hidden: boolean }) {
  const res = await fetch("/api/binder/share", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  emit({ userId, state: (await res.json()) as ShareState, failed: false });
}

// 收藏冊的「分享」：打開公開後拿到 /collector/{slug} 的連結，複製、發到 X，手機上用系統的分享選單。
// 連結帶分享人當下的語言，朋友打開看到的是同一種語言。keys 是冊子裡的卡（卡鍵），分享文字裡的張數扣掉不公開的卡
export function ShareBinderButton({ userId, keys, want }: { userId: string; keys: string[]; want: number }) {
  const t = useTranslations("Binder");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        {t("share")}
      </button>
      {open && <SharePanel userId={userId} keys={keys} want={want} onClose={() => setOpen(false)} />}
    </>
  );
}

function SharePanel({ userId, keys, want, onClose }: { userId: string; keys: string[]; want: number; onClose: () => void }) {
  const t = useTranslations("Binder");
  const locale = useLocale();
  const share = useShare(userId);
  const state = share?.state ?? null;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // 面板點了才打開，只在瀏覽器裡渲染
  const [origin] = useState(() => window.location.origin);
  const [canNativeShare] = useState(() => typeof navigator.share === "function");

  const toggle = async (next: boolean) => {
    setSaving(true);
    setFailed(false);
    try {
      await update(userId, { public: next });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const hidden = new Set(state?.hidden);
  const have = keys.filter((k) => !hidden.has(k)).length;
  const path = state?.slug ? localePath(locale, `/collector/${state.slug}`) : null;
  const url = path ? `${origin}${path}` : "";
  const text = t("shareText", { have, want });
  const shareNative = async () => {
    try {
      await navigator.share({ title: t("shareTitle"), text, url });
      track("binder_shared", { method: "native" });
    } catch {}
  };

  return (
    <Dialog label={t("shareTitle")} onClose={onClose} className="max-w-md">
      <div className="flex items-center gap-2 pr-8">
        <h2 className="text-lg font-bold">{t("shareTitle")}</h2>
        <InfoTip text={t("sharePublicHint")} label={t("shareInfoLabel")} align="start" />
      </div>
      {!state ? (
        share?.failed ? (
          <p className="mt-4 text-sm text-down">{t("shareFailed")}</p>
        ) : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-2" />
        )
      ) : (
        <>
          {state.public && path ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{url}</span>
                <CopyButton
                  text={url}
                  label={t("shareCopy")}
                  copiedLabel={t("shareCopied")}
                  onCopy={() => track("binder_shared", { method: "copy" })}
                  className="shrink-0 text-xs font-semibold text-ink-2"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("binder_shared", { method: "x" })}
                  className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
                >
                  {t("shareX")}
                </a>
                {canNativeShare && (
                  <button onClick={shareNative} className="btn-secondary rounded-full px-4 py-2 text-sm font-semibold">
                    {t("shareNative")}
                  </button>
                )}
                <a href={path} target="_blank" rel="noopener" className="btn-secondary rounded-full px-4 py-2 text-sm font-semibold">
                  {t("shareView")}
                </a>
              </div>
              <div className="flex items-center gap-2 border-t border-line pt-4">
                <button onClick={() => toggle(false)} disabled={saving} className="btn-danger rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {t("shareStop")}
                </button>
                <InfoTip text={t("shareStopHint")} label={t("shareStop")} align="start" />
              </div>
            </div>
          ) : (
            <button onClick={() => toggle(true)} disabled={saving} className="btn-primary mt-5 w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60">
              {t("sharePublic")}
            </button>
          )}
          {failed && <p className="mt-3 text-sm text-down">{t("shareFailed")}</p>}
        </>
      )}
    </Dialog>
  );
}

// 收藏冊裡一張卡的詳情裡：這張卡在不在公開收藏冊上顯示。收藏冊還沒公開時也能先設好
export function PublicToggle({ userId, slotKey }: { userId: string; slotKey: string }) {
  const t = useTranslations("Binder");
  const share = useShare(userId);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!share?.state) return null;
  const shown = !share.state.hidden.includes(slotKey);
  const change = async (next: boolean) => {
    setSaving(true);
    setFailed(false);
    try {
      await update(userId, { key: slotKey, hidden: !next });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="mt-4">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={shown} disabled={saving} onChange={(e) => change(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          <span className="block text-sm font-semibold">{t("showOnPublic")}</span>
          {!share.state.public && <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{t("showOnPublicOff")}</span>}
        </span>
      </label>
      {failed && <p className="mt-1.5 text-xs text-down">{t("shareFailed")}</p>}
    </div>
  );
}
