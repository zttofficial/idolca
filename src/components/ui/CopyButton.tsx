"use client";

import { useState } from "react";

// 全站共用的複製按鈕：前面是複製圖示，複製成功後短暫換成勾號和「已複製」。text 可以是函數（例如當下的網址）；onCopy 在複製成功後呼叫（例如記分析事件）
export default function CopyButton({
  text,
  label,
  copiedLabel,
  className = "",
  onCopy,
}: {
  text: string | (() => string);
  label: string;
  copiedLabel: string;
  className?: string;
  onCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <button onClick={copy} className={`inline-flex items-center gap-1 hover:text-ink ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        {copied ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" />
          </>
        )}
      </svg>
      {copied ? copiedLabel : label}
    </button>
  );
}
