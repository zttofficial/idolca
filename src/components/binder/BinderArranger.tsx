"use client";

import { memo, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { POCKETS } from "./BinderBook";
import { isTrackedOnly, putBack, swapPockets, type BinderLayout } from "@/lib/binder-layout";
import InfoTip from "@/components/ui/InfoTip";

// 整理收藏冊：所有內頁攤開，像實體卡冊一樣把卡拿起來換到別的卡套；拿出冊子的卡放在下面的卡盒，隨時放回。
// 點一張卡拿起、再點卡套放下（手機和電腦都能用），電腦上也能直接拖曳。
// 冊子可能有幾千張卡：每一頁（和卡盒的每一段）捲到附近才畫卡面，畫過就保留；拿起、放下只重畫有變動的頁，其他頁沿用。
// 只在「全部」且沒有篩選時整理（由收藏冊決定），所以這裡拿到的永遠是整本冊子的卡套
type Picked = { from: "pocket"; index: number; key: string } | { from: "box"; key: string } | null;
type Actions = {
  tapPocket: (index: number) => void;
  drop: (index: number, from: Picked) => void;
  takeOut: (key: string) => void;
  pickBox: (key: string) => void;
  putBack: (key: string) => void;
};

const DRAG_TYPE = "application/x-idolca-card";
const BOX_CHUNK = 54;
const readDrag = (e: React.DragEvent): Picked => {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Picked;
  } catch {
    return null;
  }
};

export default function BinderArranger({
  layout,
  pockets,
  boxed,
  present,
  version,
  render,
  onChange,
  onTakeOut,
}: {
  layout: BinderLayout;
  pockets: (string | null)[];
  boxed: string[];
  present: Set<string>;
  // 卡的內容換了（照片、狀態）時跟著換的值，沒換時各頁不必重畫
  version: unknown;
  render: (key: string) => React.ReactNode;
  onChange: (layout: BinderLayout) => void;
  // 拿出冊子：鏈上的卡收進卡盒，只是記錄的卡直接刪掉標記（由收藏冊決定）
  onTakeOut: (key: string) => void;
}) {
  const t = useTranslations("Binder");
  const [picked, setPicked] = useState<Picked>(null);
  // 最後永遠多一頁空白頁，卡可以往後放
  const pageCount = Math.ceil(pockets.length / POCKETS) + 1;

  const dropAt = (index: number, from: Picked) => {
    if (!from) return;
    if (from.from === "pocket") {
      if (from.index !== index) onChange(swapPockets(layout, from.index, index));
    } else {
      onChange(putBack(layout, from.key, present, index));
    }
    setPicked(null);
  };
  // 各頁是 memo 過的，事件處理經由 ref 拿最新的狀態，不因為處理函式換了就整本重畫
  const actions = useRef<Actions>(null!);
  useEffect(() => {
    actions.current = {
      tapPocket: (index) => {
        const key = pockets[index];
        if (picked) return dropAt(index, picked);
        if (key) setPicked({ from: "pocket", index, key });
      },
      drop: dropAt,
      takeOut: (key) => {
        onTakeOut(key);
        setPicked(null);
      },
      pickBox: (key) => setPicked(picked?.from === "box" && picked.key === key ? null : { from: "box", key }),
      putBack: (key) => onChange(putBack(layout, key, present)),
    };
  });

  const pickedIndex = picked?.from === "pocket" ? picked.index : -1;
  const pickedBox = picked?.from === "box" ? picked.key : null;
  const chunks = Array.from({ length: Math.ceil(boxed.length / BOX_CHUNK) }, (_, i) => boxed.slice(i * BOX_CHUNK, (i + 1) * BOX_CHUNK));

  return (
    <div>
      <p className="text-xs leading-relaxed text-ink-2">{t("arrangeHint")}</p>
      {/* 拿起一張卡時，其他卡套都標出可以放下 */}
      <div className={`mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${picked ? "picking" : ""}`}>
        {Array.from({ length: pageCount }, (_, p) => {
          const start = p * POCKETS;
          return (
            <ArrangerPage
              key={p}
              page={p}
              keys={Array.from({ length: POCKETS }, (_, i) => pockets[start + i] ?? null)}
              pickedIndex={pickedIndex >= start && pickedIndex < start + POCKETS ? pickedIndex : -1}
              version={version}
              render={render}
              actions={actions}
            />
          );
        })}
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = readDrag(e);
          if (from?.from === "pocket") onTakeOut(from.key);
          setPicked(null);
        }}
        className="mt-6 rounded-2xl border border-dashed border-line p-4"
      >
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {t("outOfBinder", { count: boxed.length })}
          <InfoTip text={t("outOfBinderHint")} label={t("outOfBinder", { count: boxed.length })} align="start" />
        </p>
        {chunks.map((keys, i) => (
          <BoxChunk key={i} keys={keys} pickedKey={pickedBox && keys.includes(pickedBox) ? pickedBox : null} version={version} render={render} actions={actions} />
        ))}
      </div>
    </div>
  );
}

// 捲到畫面附近（上下各多一個螢幕高）才算看得到；看過一次就一直畫著，捲回來不用重畫
function useSeen() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

const sameKeys = (a: (string | null)[], b: (string | null)[]) => a.length === b.length && a.every((k, i) => k === b[i]);

type PageProps = {
  page: number;
  keys: (string | null)[];
  pickedIndex: number;
  version: unknown;
  render: (key: string) => React.ReactNode;
  actions: React.RefObject<Actions>;
};

// 一頁 3×3 卡套。卡套內容、拿起的卡、卡的資料都沒變時不重畫（render 每次都是新函式，不拿來比較）
const ArrangerPage = memo(
  function ArrangerPage({ page, keys, pickedIndex, render, actions }: PageProps) {
    const t = useTranslations("Binder");
    const { ref, seen } = useSeen();
    // 還沒捲到的頁只畫同樣大小的空卡套，不掛按鈕和拖放，幾千張卡時頁面上的元素少很多
    if (!seen) {
      return (
        <div ref={ref} className="rounded-xl bg-[#f7f5f0] p-3 ring-1 ring-line">
          <div className="grid grid-cols-3 gap-2">
            {keys.map((_, i) => (
              <div key={i} className="aspect-[55/85] rounded-md bg-[#ebe8e1]" />
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-ink-3">{t("pageN", { n: page + 1 })}</p>
        </div>
      );
    }
    return (
      <div ref={ref} className="rounded-xl bg-[#f7f5f0] p-3 ring-1 ring-line">
        <div className="grid grid-cols-3 gap-2">
          {keys.map((key, i) => {
            const index = page * POCKETS + i;
            const isPicked = pickedIndex === index;
            return (
              <div
                key={index}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  actions.current.drop(index, readDrag(e));
                }}
                className="group relative aspect-[55/85] rounded-md bg-[#ebe8e1] shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)] [.picking_&]:ring-1 [.picking_&]:ring-accent/40"
              >
                <button
                  type="button"
                  aria-label={key ? t("pickUp") : t("emptyPocket")}
                  draggable={Boolean(key)}
                  onDragStart={(e) => key && e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ from: "pocket", index, key }))}
                  onClick={() => actions.current.tapPocket(index)}
                  className={`absolute inset-0 rounded-md ${isPicked ? "ring-2 ring-accent" : ""}`}
                >
                  {key && <span className="pointer-events-none absolute inset-[5%] overflow-hidden rounded-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.25)]">{render(key)}</span>}
                </button>
                {key && (
                  <button
                    type="button"
                    title={t(isTrackedOnly(key) ? "removeFromBinder" : "takeOut")}
                    aria-label={t(isTrackedOnly(key) ? "removeFromBinder" : "takeOut")}
                    onClick={() => actions.current.takeOut(key)}
                    className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink/80 text-[11px] leading-none text-white opacity-80 hover:bg-down hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[10px] text-ink-3">{t("pageN", { n: page + 1 })}</p>
      </div>
    );
  },
  (a, b) => a.page === b.page && a.pickedIndex === b.pickedIndex && a.version === b.version && sameKeys(a.keys, b.keys),
);

type BoxProps = { keys: string[]; pickedKey: string | null; version: unknown; render: (key: string) => React.ReactNode; actions: React.RefObject<Actions> };

// 卡盒裡的一段卡，一樣捲到附近才畫
const BoxChunk = memo(
  function BoxChunk({ keys, pickedKey, render, actions }: BoxProps) {
    const t = useTranslations("Binder");
    const { ref, seen } = useSeen();
    return (
      <div ref={ref} className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-9">
        {keys.map((key) => (
          <div key={key} className="flex flex-col gap-1">
            <button
              type="button"
              draggable
              onDragStart={(e) => e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ from: "box", key }))}
              onClick={() => actions.current.pickBox(key)}
              aria-label={t("pickUp")}
              className={`aspect-[55/85] overflow-hidden rounded-md ${pickedKey === key ? "ring-2 ring-accent" : "ring-1 ring-line"}`}
            >
              {seen && <span className="pointer-events-none block h-full w-full">{render(key)}</span>}
            </button>
            <button type="button" onClick={() => actions.current.putBack(key)} className="text-[11px] font-semibold text-accent-ink hover:underline">
              {t("putBack")}
            </button>
          </div>
        ))}
      </div>
    );
  },
  (a, b) => a.pickedKey === b.pickedKey && a.version === b.version && sameKeys(a.keys, b.keys),
);
