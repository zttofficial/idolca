import posthog from "posthog-js";

// 產品分析（PostHog，歐盟機房）：頁面瀏覽、來源，加上 src/lib/analytics.ts 記的關鍵動作。
// 只在正式構建、設了 NEXT_PUBLIC_POSTHOG_KEY 時啟用，本機開發和端到端測試的流量不會混進來（Vercel 上只在 Production 設這個變數）。
// 不用 cookie、也不寫瀏覽器儲存空間：訪客由 PostHog 伺服器端的隱私雜湊辨識，所以不需要 cookie 同意彈窗。
// 這個模式要在 PostHog 專案設定裡打開，否則事件會被丟掉
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (key && process.env.NODE_ENV === "production") {
  try {
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
      defaults: "2026-08-30",
      cookieless_mode: "always",
    });
  } catch (err) {
    console.error("analytics init failed", err);
  }
}
