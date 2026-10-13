import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// 按網址前綴決定語言；英文網址不帶前綴
export default createMiddleware(routing);

export const config = {
  // 跳過 API、Next 內部路徑、分享圖和帶副檔名的靜態檔案。分享圖各語言共用，放在根目錄，不能被加上語言前綴
  matcher: "/((?!api|_next|_vercel|opengraph-image|.*\\..*).*)",
};
