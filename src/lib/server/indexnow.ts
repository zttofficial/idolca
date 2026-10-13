import "server-only";
import { after } from "next/server";
import { routing } from "@/i18n/routing";
import { SITE_URL, localePath } from "@/lib/seo";

// IndexNow：頁面新增或內容變了，主動通知 Bing、Naver、Yandex 等搜尋引擎來抓，不用等它們重讀站點地圖（Google 不參加，靠站點地圖）。
// 搜尋引擎到 /{INDEXNOW_KEY}.txt 核對金鑰證明網站是我們的，金鑰本來就公開，檔案在 public/
const INDEXNOW_KEY = "a7f39318d986b3ecc24a83211ea73056";

// paths 是不帶語言前綴的頁面路徑，八種語言的網址一起送。回應送出後才發，失敗只記日誌，不影響用戶操作；只有正式部署發
export function notifyIndexNow(...paths: string[]) {
  if (process.env.VERCEL_ENV !== "production") return;
  const urlList = paths.flatMap((p) => routing.locales.map((l) => `${SITE_URL}${localePath(l, p)}`));
  after(async () => {
    try {
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList }),
      });
      if (!res.ok) console.error("indexnow rejected", res.status, await res.text().catch(() => ""));
    } catch (err) {
      console.error("indexnow failed", err);
    }
  });
}
