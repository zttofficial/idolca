import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// 分享圖的版本號：按繪製程式碼和字型算雜湊，拼在圖片網址後面。社群平台按網址緩存縮略圖，圖改了網址也得跟著變
const shareImageHash = createHash("sha256");
for (const f of ["src/app/opengraph-image.tsx", "src/lib/server/share-image.tsx", "src/assets/fonts/Geist-Regular.ttf", "src/assets/fonts/Geist-ExtraBold.ttf"])
  shareImageHash.update(readFileSync(f));
const shareImageVersion = shareImageHash.digest("hex").slice(0, 12);

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { SHARE_IMAGE_VERSION: shareImageVersion },
  // 動態頁面（卡片、刊登）的 metadata 預設串流進 <body>，只有這份名單上的爬蟲會在 <head> 裡拿到。
  // 在 Next 的預設名單上補上目標市場的分享爬蟲：KakaoTalk、Daum（韓國）、LINE、Zalo（越南）、Telegram、Pinterest 等，否則分享卡片頁沒有縮略圖
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE.source}|kakaotalk-scrap|Daum|line-poker|Zalo|TelegramBot|Pinterest|Mastodon|Embedly|Iframely|Viber|Snapchat|Threads`),
  // PGlite 帶 WebAssembly 和資料檔，不打包，執行時從 node_modules 載入
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  // 開發時用手機從區網 IP 打開，開發用的 JS 和熱更新預設只給 localhost
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
