import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
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
