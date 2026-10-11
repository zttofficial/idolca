import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 單元測試只測純邏輯（不連資料庫和鏈）；端到端測試在 e2e/，對著跑起來的網站和 devnet 執行
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["tests/**/*.test.ts"] },
});
