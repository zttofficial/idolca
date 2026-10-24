"use client";

import type { PostHog } from "posthog-js";

// 產品分析的事件：只記動作和金額這類統計需要的內容，不記郵箱、錢包地址、收件地址
export type AnalyticsEvent = "signed_up" | "logged_in" | "wallet_linked" | "card_added" | "collectible_minted" | "listed" | "purchased" | "bid_placed" | "pack_opened" | "group_picked" | "binder_marked" | "binder_shared";

// PostHog（約 100KB gzip）不進首屏：頁面載入完、瀏覽器空閒時才下載和初始化（src/instrumentation-client.ts 呼叫），不和首頁主視覺、卡片資料搶頻寬和主執行緒
let posthog: PostHog | null = null;

export function startAnalytics(init: (p: PostHog) => void) {
  import("posthog-js")
    .then(({ default: p }) => {
      init(p);
      posthog = p;
    })
    .catch((err) => console.error("analytics init failed", err));
}

// PostHog 沒啟用或還沒載入時什麼都不做；記錄失敗也不影響操作本身
export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean | null>) {
  try {
    if (posthog?.__loaded) posthog.capture(event, props);
  } catch {}
}
