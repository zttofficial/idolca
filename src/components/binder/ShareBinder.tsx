"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import CopyButton from "@/components/ui/CopyButton";
import { track } from "@/lib/analytics";
import { localePath } from "@/lib/seo";

type ShareState = { public: boolean; slug: string | null };

// 收藏冊的「分享」：打開公開後拿到 /collector/{slug} 的連結，複製、發到 X，手機上用系統的分享選單。
// 連結帶分享人當下的語言，朋友打開看到的是同一種語言
export function ShareBinderButton({ have, want }: { have: number; want: number }) {
  const t = useTranslations("Binder");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:bg-surface-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        </svg>
        {t("share")}
      </button>
      {open && <SharePanel have={have} want={want} onClose={() => setOpen(false)} />}
    </>
  );
}

function SharePanel({ have, want, onClose }: { have: number; want: number; onClose: () => void }) {
  const t = useTranslations("Binder");
  const locale = useLocale();
  const [state, setState] = useState<ShareState | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // 面板點了才打開，只在瀏覽器裡渲染
  const [origin] = useState(() => window.location.origin);
  const [canNativeShare] = useState(() => typeof navigator.share === "function");

  useEffect(() => {
    fetch("/api/binder/share")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setState)
      .catch(() => setFailed(true));
  }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/binder/share", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public: next }) });
      if (!res.ok) throw new Error(String(res.status));
      setState(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

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
      <h2 className="pr-8 text-lg font-bold">{t("shareTitle")}</h2>
      {!state ? (
        failed ? (
          <p className="mt-4 text-sm text-down">{t("shareFailed")}</p>
        ) : (
          <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-2" />
        )
      ) : (
        <>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={state.public} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              <span className="block text-sm font-semibold">{t("sharePublic")}</span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-3">{t("sharePublicHint")}</span>
            </span>
          </label>
          {failed && <p className="mt-3 text-sm text-down">{t("shareFailed")}</p>}
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
                  <button onClick={shareNative} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-surface-2">
                    {t("shareNative")}
                  </button>
                )}
                <a href={path} target="_blank" rel="noopener" className="rounded-full px-3 py-2 text-sm font-semibold text-accent-ink hover:underline">
                  {t("shareView")}
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-ink-3">{t("shareOffNote")}</p>
          )}
        </>
      )}
    </Dialog>
  );
}
