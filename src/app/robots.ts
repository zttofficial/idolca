import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// 後台、接口和個人頁面（收藏冊）不給搜尋引擎收錄。卡片照片也走接口（/api/media），要放行：
// Google 圖片、商品資訊和遵守 robots.txt 的分享爬蟲（如 Twitterbot）都要能抓到
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/admin", "/binder"];
  return {
    rules: { userAgent: "*", allow: ["/", "/api/media/"], disallow: ["/api/", ...privatePaths, ...privatePaths.map((p) => `/*${p}`)] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
