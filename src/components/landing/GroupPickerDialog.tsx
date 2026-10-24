"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Dialog from "@/components/ui/Dialog";
import { Link } from "@/i18n/navigation";
import { track } from "@/lib/analytics";
import { useBinder } from "@/lib/binder";
import { GROUPS } from "@/lib/catalog";

// 首頁的第一步引導：打開幾秒後彈出「你收哪個團？」，選團進圖鑑勾卡，不用註冊。
// 關掉或選過一次就不再出現（記在 localStorage）；收藏冊裡已經有卡的人不彈
const KEY = "idolca:group-picker:seen";
const DELAY_MS = 3000;

function seen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    // 讀不到儲存空間（隱私模式等）：當作看過，不要每次都彈
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
}

export default function GroupPickerDialog() {
  const t = useTranslations("Hero");
  const binder = useBinder();
  const empty = Object.keys(binder.have).length === 0 && Object.keys(binder.want).length === 0;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!empty || seen()) return;
    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, [empty]);

  if (!open) return null;
  const close = () => {
    markSeen();
    setOpen(false);
  };
  return (
    <Dialog label={t("pickGroup")} onClose={close} className="max-w-lg">
      <h2 className="pr-8 text-2xl font-bold tracking-tight">{t("pickGroup")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("pickGroupBody")}</p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <Link
            key={g.id}
            href={`/catalog/${g.id}`}
            onClick={() => {
              markSeen();
              track("group_picked", { group: g.id, from: "popup" });
            }}
            className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-line-strong hover:bg-surface-2"
          >
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${g.palette[0]}, ${g.palette[2]})` }} aria-hidden />
            <span className="truncate">{g.name}</span>
          </Link>
        ))}
      </div>
      <button onClick={close} className="mt-5 w-full rounded-full py-2 text-sm text-ink-3 hover:text-ink">
        {t("pickGroupLater")}
      </button>
    </Dialog>
  );
}
