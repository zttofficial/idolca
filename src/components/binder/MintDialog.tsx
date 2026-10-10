"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { binderActions } from "@/lib/binder";
import { templateCard, type Template } from "@/lib/catalog";

const OUT_W = 330;
const OUT_H = 510;

// 把用戶的照片置中裁成 55:85，壓成小 JPEG，存得進 localStorage
async function cropToCard(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const ratio = OUT_W / OUT_H;
    let sw = img.width;
    let sh = img.height;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    canvas.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function MintDialog({ template, onClose }: { template: Template; onClose: () => void }) {
  const t = useTranslations("Mint");
  const tRarity = useTranslations("Rarity");
  const [photo, setPhoto] = useState<string>();
  const [done, setDone] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const base = templateCard(template);
  const card = photo ? { ...base, image: { front: photo } } : base;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("title")} className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t("title")}</h2>
            <p className="mt-1 text-sm text-ink-2">
              {template.group} {template.member} · {template.album} · {template.version}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 hover:bg-surface-2">
            {t("close")}
          </button>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-[200px_1fr]">
          <div>
            <div className={`aspect-[55/85] overflow-hidden rounded-xl ${photo ? "" : "opacity-60"}`}>
              <CardArt card={card} rarityLabel={tRarity(template.rarity)} className="block h-full w-full" />
            </div>
            <input
              ref={input}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto(await cropToCard(file));
              }}
            />
            {!done && (
              <button onClick={() => input.current?.click()} className="mt-3 w-full rounded-full border border-line py-2 text-sm font-semibold hover:bg-surface-2">
                {photo ? t("retake") : t("choosePhoto")}
              </button>
            )}
          </div>

          <div>
            {done ? (
              <div className="rounded-xl bg-up/10 p-4 text-sm text-up">{t("done")}</div>
            ) : (
              <>
                <p className="text-sm text-ink-2">{t("photoHint")}</p>
                <h3 className="mt-5 text-sm font-semibold">{t("levelsTitle")}</h3>
                <ul className="mt-2 space-y-3 text-sm">
                  <li className="rounded-xl border border-accent bg-accent-soft p-3">
                    <p className="font-semibold">{t("levelSelfTitle")}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">{t("levelSelf")}</p>
                  </li>
                  <li className="rounded-xl border border-line p-3">
                    <p className="font-semibold">{t("levelVaultTitle")}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">{t("levelVault")}</p>
                  </li>
                </ul>
                <p className="mt-4 text-xs text-ink-3">{t("fee")}</p>
                <button
                  disabled={!photo}
                  onClick={() => {
                    if (!photo) return;
                    binderActions.mint(template.id, photo);
                    setDone(true);
                  }}
                  className="btn-primary mt-3 w-full rounded-full py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("confirm")}
                </button>
                <p className="mt-3 rounded-lg border border-notice-line bg-notice-bg px-3 py-2 text-[11px] text-notice-ink">{t("demoNote")}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
