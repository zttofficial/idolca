"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthContext";
import { TrackingBlock } from "@/components/shipping/Tracking";
import type { Tracking } from "@/lib/tracking";

type MyRedemption = { requestedAt: string; shippedAt: string | null; cancelled: boolean; tracking: Tracking | null };

// 卡片頁上給提貨申請人看的寄出日期和物流單號；別人看不到（接口只回給申請的帳號或錢包）
export default function RedemptionStatus({ cardId }: { cardId: string }) {
  const t = useTranslations("Detail");
  const { user } = useAuth();
  const [r, setR] = useState<MyRedemption | null>(null);
  useEffect(() => {
    if (!user) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/redemptions/${cardId}`);
        if (res.ok && live) setR(((await res.json()) as { redemption: MyRedemption | null }).redemption);
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, [cardId, user]);

  if (!user || !r || r.cancelled || !r.shippedAt) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-ink-2">{t("redeemShipped", { date: new Date(r.shippedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) })}</p>
      {r.tracking && <TrackingBlock tracking={r.tracking} />}
    </div>
  );
}
