import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SITE_URL } from "./lib/seo";

// 按網址前綴決定語言；英文網址不帶前綴
const intl = createMiddleware(routing);

export default function proxy(req: NextRequest) {
  // 正式部署的頁面只在主網域提供：idolca.vercel.app 上的頁面 308 轉到 idolca.trade，免得搜尋引擎收錄兩份。
  // 早期 NFT 的元數據網址指向 idolca.vercel.app/api/meta，接口不經這裡，照常服務
  if (process.env.VERCEL_ENV === "production" && req.nextUrl.hostname.endsWith(".vercel.app")) {
    return NextResponse.redirect(`${SITE_URL}${req.nextUrl.pathname}${req.nextUrl.search}`, 308);
  }
  const res = intl(req);
  // 預覽部署不給搜尋引擎收錄
  if (process.env.VERCEL_ENV === "preview") res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

export const config = {
  // 跳過 API、Next 內部路徑、分享圖和帶副檔名的靜態檔案。分享圖各語言共用，放在根目錄，不能被加上語言前綴
  matcher: "/((?!api|_next|_vercel|opengraph-image|.*\\..*).*)",
};
