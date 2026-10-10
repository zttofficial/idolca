"use client";

import { useTranslations } from "next-intl";
import { useBinder } from "@/lib/binder";

// 某團體的收集進度條（讀本機收藏冊）
export default function GroupProgress({ ids }: { ids: string[] }) {
  const t = useTranslations("Catalog");
  const binder = useBinder();
  const have = ids.filter((id) => binder.have[id]).length;
  return (
    <div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full bg-accent" style={{ width: `${(have / ids.length) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-3 tabular-nums">{t("collected", { have, total: ids.length })}</p>
    </div>
  );
}
