"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// 一本實體卡冊：硬殼外框、中間三個活頁環，左右各一頁、每頁 3×3 透明卡套。
// 翻下一頁時，右頁以書脊為軸 3D 翻到左邊（正面是目前的右頁，背面是下一張左頁）；翻上一頁反過來。
// 窄螢幕一次顯示一頁，翻頁一樣是以左側為軸翻過去。slots 是每個卡套裡的內容，null 是空卡套
export const POCKETS = 9;
const FLIP_MS = 700;

type Flip = { dir: "next" | "prev"; from: number } | null;

function usePagesPerView() {
  const [two, setTwo] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setTwo(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return two ? 2 : 1;
}

export default function BinderBook({ slots, minPages = 2, title }: { slots: React.ReactNode[]; minPages?: number; title?: string }) {
  const t = useTranslations("Binder");
  const perView = usePagesPerView();
  // 頁數湊成雙數，雙頁攤開時右邊不會缺頁
  const rawPages = Math.max(minPages, Math.ceil(slots.length / POCKETS));
  const pageCount = rawPages + (rawPages % 2);
  const pages = Array.from({ length: pageCount }, (_, p) => Array.from({ length: POCKETS }, (_, i) => slots[p * POCKETS + i] ?? null));
  const views = Math.ceil(pageCount / perView);

  const [view, setView] = useState(0);
  const [flip, setFlip] = useState<Flip>(null);
  const current = Math.min(view, views - 1);

  const go = useCallback(
    (dir: "next" | "prev") => {
      if (flip) return;
      if (dir === "next" && current >= views - 1) return;
      if (dir === "prev" && current <= 0) return;
      setFlip({ dir, from: current });
      setTimeout(() => {
        setView(current + (dir === "next" ? 1 : -1));
        setFlip(null);
      }, FLIP_MS);
    },
    [current, flip, views],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") go("next");
      if (e.key === "ArrowLeft") go("prev");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const page = (index: number, side: "left" | "right" | "single") =>
    index >= 0 && index < pageCount ? <Page pocketList={pages[index]} number={index + 1} side={side} /> : <div className="h-full rounded-xl bg-[#ece9e2]" />;

  // 目前攤開的頁（翻頁動畫進行中時，底下先露出翻完後的那一頁）
  const base = (flip?.from ?? current) * perView;
  let left: number;
  let right: number;
  if (perView === 2) {
    left = flip?.dir === "prev" ? base - 2 : base;
    right = flip?.dir === "next" ? base + 3 : base + 1;
  } else {
    left = flip?.dir === "next" ? base + 1 : flip?.dir === "prev" ? base - 1 : base;
    right = -1;
  }

  return (
    <div>
      {title && <p className="mb-3 text-center text-xs font-semibold tracking-[0.2em] text-ink-3 uppercase">{title}</p>}
      {/* 硬殼外框 */}
      <div className="relative mx-auto max-w-[880px] rounded-[28px] bg-gradient-to-br from-[#2a2630] to-[#17151b] p-3 shadow-[0_30px_60px_-20px_rgba(20,10,30,0.45)] sm:p-4">
        <div className="pointer-events-none absolute inset-2 rounded-[22px] border border-dashed border-white/10" />
        <div className={`relative [perspective:2200px] ${perView === 1 ? "overflow-hidden rounded-xl" : ""}`}>
          <div className={`relative grid gap-0 ${perView === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="relative">{page(left, perView === 2 ? "left" : "single")}</div>
            {perView === 2 && <div className="relative">{page(right, "right")}</div>}

            {/* 翻動中的那一頁：正面和背面各一頁，以書脊為軸轉 180° */}
            {flip && (
              <div
                className={`absolute top-0 h-full [transform-style:preserve-3d] ${perView === 2 ? (flip.dir === "next" ? "right-0 w-1/2 origin-left" : "left-0 w-1/2 origin-right") : "inset-x-0 origin-left"}`}
                style={{ animation: `${flip.dir === "next" ? "binder-flip-next" : "binder-flip-prev"} ${FLIP_MS}ms cubic-bezier(.45,.05,.25,1) forwards` }}
              >
                <div className="absolute inset-0 [backface-visibility:hidden]">
                  {perView === 2 ? page(flip.dir === "next" ? base + 1 : base, flip.dir === "next" ? "right" : "left") : page(base, "single")}
                  <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-black/0 to-black/20" style={{ animation: `binder-shade ${FLIP_MS}ms ease-in forwards` }} />
                </div>
                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  {perView === 2
                    ? page(flip.dir === "next" ? base + 2 : base - 1, flip.dir === "next" ? "left" : "right")
                    : page(flip.dir === "next" ? base + 1 : base - 1, "single")}
                </div>
              </div>
            )}

            {/* 活頁環 */}
            {perView === 2 && (
              <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 flex -translate-x-1/2 flex-col justify-around py-[12%]">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="block h-5 w-10 rounded-full border-[3px] border-[#c9c6cf] bg-transparent shadow-[inset_0_1px_2px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.6)]" />
                ))}
              </div>
            )}

            {/* 點頁面外側邊緣翻頁 */}
            <button aria-label={t("prev")} onClick={() => go("prev")} disabled={current === 0} className="absolute inset-y-0 left-0 z-20 w-8 cursor-w-resize disabled:cursor-default" />
            <button aria-label={t("next")} onClick={() => go("next")} disabled={current >= views - 1} className="absolute inset-y-0 right-0 z-20 w-8 cursor-e-resize disabled:cursor-default" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 text-sm">
        <button disabled={current === 0 || Boolean(flip)} onClick={() => go("prev")} className="rounded-full border border-line px-4 py-1.5 hover:bg-surface-2 disabled:opacity-40">
          {t("prev")}
        </button>
        <span className="text-ink-3 tabular-nums">{t("page", { page: current + 1, pages: views })}</span>
        <button disabled={current >= views - 1 || Boolean(flip)} onClick={() => go("next")} className="rounded-full border border-line px-4 py-1.5 hover:bg-surface-2 disabled:opacity-40">
          {t("next")}
        </button>
      </div>
    </div>
  );
}

// 一頁內頁：米白紙面，靠書脊那側有陰影，3×3 透明卡套
function Page({ pocketList, number, side }: { pocketList: React.ReactNode[]; number: number; side: "left" | "right" | "single" }) {
  const spine = side === "left" ? "bg-gradient-to-l" : "bg-gradient-to-r";
  return (
    <div className={`relative h-full bg-[#f7f5f0] p-3 sm:p-5 ${side === "left" ? "rounded-l-xl" : side === "right" ? "rounded-r-xl" : "rounded-xl"}`}>
      {side !== "single" && <div className={`pointer-events-none absolute inset-y-0 w-10 ${side === "left" ? "right-0" : "left-0"} ${spine} from-black/15 to-transparent`} />}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {pocketList.map((content, i) => (
          <div key={i} className="relative aspect-[55/85] rounded-md bg-[#ebe8e1] shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]">
            {content && <div className="absolute inset-[5%] overflow-hidden rounded-[5px] shadow-[0_1px_3px_rgba(0,0,0,0.25)]">{content}</div>}
            {/* 透明卡套：上緣開口和一道斜向反光 */}
            <span className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-white/45 via-white/5 to-white/20 ring-1 ring-white/60 ring-inset" />
            <span className="pointer-events-none absolute inset-x-[8%] top-[3%] h-px bg-white/80" />
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[10px] text-ink-3 tabular-nums">{number}</p>
    </div>
  );
}
