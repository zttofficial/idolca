import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// 分享圖的版本號：按繪製程式碼和字型算雜湊，拼在圖片網址後面。社群平台按網址緩存縮略圖，圖改了網址也得跟著變
const shareImageHash = createHash("sha256");
for (const f of ["src/app/opengraph-image.tsx", "src/assets/fonts/Geist-Regular.ttf", "src/assets/fonts/Geist-ExtraBold.ttf"]) shareImageHash.update(readFileSync(f));
const shareImageVersion = shareImageHash.digest("hex").slice(0, 12);

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { SHARE_IMAGE_VERSION: shareImageVersion },
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
