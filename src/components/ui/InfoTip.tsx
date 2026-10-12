"use client";

import { useState } from "react";

// 全站共用的說明小問號：滑過、聚焦或點一下時，在上方浮出一段說明。
// 解釋性的小字（為什麼、是什麼、要付多少）一律收進這裡，不攤在畫面上；操作必需的提示和法律聲明照樣直接顯示。
// align 決定浮窗對齊問號的哪一邊，靠近畫面左右邊緣時用 start 或 end，免得被切掉
export default function InfoTip({ text, label, align = "center" }: { text: string; label: string; align?: "start" | "center" | "end" }) {
  const place = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="grid h-5 w-5 place-items-center rounded-full border border-line text-[11px] font-bold text-ink-3 hover:border-ink-3 hover:text-ink"
      >
        ?
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full ${place} z-30 mb-2 w-64 rounded-xl bg-ink px-3 py-2 text-left text-xs leading-relaxed font-normal text-white shadow-lg transition ${open ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        {text}
      </span>
    </span>
  );
}
