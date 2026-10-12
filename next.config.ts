import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 不打包，執行時從 node_modules 載入：PGlite 帶 WebAssembly 和資料檔；
  // Anchor 的 CommonJS 在頁面（Server Components）的打包環境下會報 exports is not defined
  serverExternalPackages: ["@electric-sql/pglite", "@anchor-lang/core"],
  partialPrefetching: true,
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
