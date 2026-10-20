"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseButton } from "@/components/ui/Dialog";

// 後台列表的詳情面板：從右邊滑出，手機上佔滿整個畫面。和 Dialog 一樣掛到 body、按 Esc 或點遮罩關閉；
// 層級比 Dialog 低一層，面板裡再打開的彈窗（填物流單號）會蓋在上面
export default function Drawer({ label, onClose, wide = false, children }: { label: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal="true"]:not([data-drawer])') && onClose();
    window.addEventListener("keydown", onKey);
    // 面板開著時背景不跟著捲
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} data-drawer className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-surface shadow-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{label}</h2>
          <CloseButton onClick={onClose} className="-mt-1 -mr-2 shrink-0" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
