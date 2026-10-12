"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { POCKETS } from "./BinderBook";
import { putBack, swapPockets, takeOut, type BinderLayout } from "@/lib/binder-layout";

// 整理收藏冊：所有內頁攤開，像實體卡冊一樣把卡拿起來換到別的卡套；拿出冊子的卡放在下面的卡盒，隨時放回。
// 點一張卡拿起、再點卡套放下（手機和電腦都能用），電腦上也能直接拖曳。
type Picked = { from: "pocket"; index: number; key: string } | { from: "box"; key: string } | null;

export default function BinderArranger({
  layout,
  pockets,
  boxed,
  present,
  render,
  onChange,
}: {
  layout: BinderLayout;
  pockets: (string | null)[];
  boxed: string[];
  present: Set<string>;
  render: (key: string) => React.ReactNode;
  onChange: (layout: BinderLayout) => void;
}) {
  const t = useTranslations("Binder");
  const [picked, setPicked] = useState<Picked>(null);
  // 最後永遠多一頁空白頁，卡可以往後放
  const pageCount = Math.ceil(pockets.length / POCKETS) + 1;

  const dropAt = (index: number, from: Picked = picked) => {
    if (!from) return;
    if (from.from === "pocket") {
      if (from.index !== index) onChange(swapPockets(layout, from.index, index));
    } else {
      onChange(putBack(layout, from.key, present, index));
    }
    setPicked(null);
  };
  const tapPocket = (index: number) => {
    const key = pockets[index];
    if (picked) return dropAt(index);
    if (key) setPicked({ from: "pocket", index, key });
  };
  const dragData = (p: Picked) => JSON.stringify(p);
  const readDrag = (e: React.DragEvent): Picked => {
    try {
      return JSON.parse(e.dataTransfer.getData("application/x-idolca-card")) as Picked;
    } catch {
      return null;
    }
  };

  return (
    <div>
      <p className="text-xs leading-relaxed text-ink-2">{t("arrangeHint")}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: pageCount }, (_, p) => (
          <div key={p} className="rounded-xl bg-[#f7f5f0] p-3 ring-1 ring-line">
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: POCKETS }, (_, i) => {
                const index = p * POCKETS + i;
                const key = pockets[index] ?? null;
                const isPicked = picked?.from === "pocket" && picked.index === index;
                return (
                  <div
                    key={index}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropAt(index, readDrag(e));
                    }}
                    className={`group relative aspect-[55/85] rounded-md bg-[#ebe8e1] shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)] ${picked && !isPicked ? "ring-1 ring-accent/40" : ""}`}
                  >
                    <button
                      type="button"
                      aria-label={key ? t("pickUp") : t("emptyPocket")}
                      draggable={Boolean(key)}
                      onDragStart={(e) => key && e.dataTransfer.setData("application/x-idolca-card", dragData({ from: "pocket", index, key }))}
                      onClick={() => tapPocket(index)}
                      className={`absolute inset-0 rounded-md ${isPicked ? "ring-2 ring-accent" : ""}`}
                    >
                      {key && <span className="pointer-events-none absolute inset-[5%] overflow-hidden rounded-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.25)]">{render(key)}</span>}
                    </button>
                    {key && (
                      <button
                        type="button"
                        title={t("takeOut")}
                        aria-label={t("takeOut")}
                        onClick={() => {
                          onChange(takeOut(layout, key));
                          setPicked(null);
                        }}
                        className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink/80 text-[11px] leading-none text-white opacity-80 hover:bg-down hover:opacity-100"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-center text-[10px] text-ink-3">{t("pageN", { n: p + 1 })}</p>
          </div>
        ))}
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = readDrag(e);
          if (from?.from === "pocket") onChange(takeOut(layout, from.key));
          setPicked(null);
        }}
        className="mt-6 rounded-2xl border border-dashed border-line p-4"
      >
        <p className="text-sm font-semibold">{t("outOfBinder", { count: boxed.length })}</p>
        <p className="mt-1 text-xs text-ink-3">{t("outOfBinderHint")}</p>
        {boxed.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-9">
            {boxed.map((key) => {
              const isPicked = picked?.from === "box" && picked.key === key;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("application/x-idolca-card", dragData({ from: "box", key }))}
                    onClick={() => setPicked(isPicked ? null : { from: "box", key })}
                    aria-label={t("pickUp")}
                    className={`aspect-[55/85] overflow-hidden rounded-md ${isPicked ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
                  >
                    <span className="pointer-events-none block h-full w-full">{render(key)}</span>
                  </button>
                  <button type="button" onClick={() => onChange(putBack(layout, key, present))} className="text-[11px] font-semibold text-accent-ink hover:underline">
                    {t("putBack")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
