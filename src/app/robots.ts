import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// 後台、接口和個人頁面（收藏冊）不給搜尋引擎收錄
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/admin", "/binder"];
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", ...privatePaths, ...privatePaths.map((p) => `/*${p}`)] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
