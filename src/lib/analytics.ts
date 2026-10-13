"use client";

import posthog from "posthog-js";

// 產品分析的事件：只記動作和金額這類統計需要的內容，不記郵箱、錢包地址、收件地址
export type AnalyticsEvent = "signed_up" | "logged_in" | "wallet_linked" | "card_added" | "collectible_minted" | "listed" | "purchased" | "bid_placed" | "pack_opened";

// PostHog 沒啟用時（本機、沒設金鑰）什麼都不做；記錄失敗也不影響操作本身
export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean | null>) {
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {}
}
