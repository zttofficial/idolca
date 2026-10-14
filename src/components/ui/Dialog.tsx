"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

// 全站共用的關閉鈕：右上角的圓形 ×
export function CloseButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  const t = useTranslations("Common");
  return (
    <button onClick={onClick} aria-label={t("close")} className={`grid h-8 w-8 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

// 彈窗外框：半透明遮罩加置中的面板，右上角 × 關閉，點遮罩或按 Esc 也會關。內容由呼叫方排。
// layer 是疊放層級：要蓋在別的彈窗上面時（例如付款途中要輸入收藏錢包的驗證碼）給更高的。
// 一律掛到 body 上：從導航列的選單裡打開時，導航列的 backdrop-filter 會讓 fixed 定位改成相對導航列，彈窗會被切掉
export default function Dialog({
  label,
  onClose,
  children,
  className = "max-w-xl",
  layer = "z-[60]",
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  layer?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={label} className={`fixed inset-0 ${layer} overflow-y-auto overscroll-contain bg-black/50 backdrop-blur-sm`} onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className={`relative w-full rounded-2xl border border-line bg-surface p-6 shadow-2xl ${className}`} onClick={(e) => e.stopPropagation()}>
          <CloseButton onClick={onClose} className="absolute top-3 right-3" />
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
