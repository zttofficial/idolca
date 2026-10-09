import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// 按網址前綴決定語言；英文網址不帶前綴
export default createMiddleware(routing);

export const config = {
  // 跳過 API、Next 內部路徑和帶副檔名的靜態檔案
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
