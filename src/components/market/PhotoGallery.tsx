"use client";

import { useState } from "react";

// 用戶上傳的多張照片：大圖 + 縮圖列
export default function PhotoGallery({ photos, alt, dim = false }: { photos: string[]; alt: string; dim?: boolean }) {
  const [shown, setShown] = useState(0);
  return (
    <div>
      <div className="aspect-[55/85] overflow-hidden rounded-2xl bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片，已裁成 55:85 */}
        <img src={photos[shown]} alt={alt} className={`h-full w-full object-cover ${dim ? "grayscale" : ""}`} />
      </div>
      {photos.length > 1 && <Thumbs photos={photos} shown={shown} onShow={setShown} />}
    </div>
  );
}

export function Thumbs({ photos, shown, onShow }: { photos: string[]; shown: number; onShow: (i: number) => void }) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-1.5">
      {photos.map((p, i) => (
        <button key={p} onClick={() => onShow(i)} className={`aspect-[55/85] overflow-hidden rounded-md ${i === shown ? "ring-2 ring-ink" : "opacity-70 hover:opacity-100"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
          <img src={p} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
