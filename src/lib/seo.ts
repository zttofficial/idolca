import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

// 搜尋引擎和社群分享用的頁面資訊：canonical 網址、八種語言互相對應（hreflang）、Open Graph 和 Twitter 卡片。
// 英文不帶語言前綴，其他語言帶前綴（見 src/i18n/routing.ts）
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://idolca.trade").replace(/\/$/, "");

const OG_LOCALE: Record<string, string> = { en: "en_US", "zh-Hant": "zh_TW", "zh-Hans": "zh_CN", ja: "ja_JP", ko: "ko_KR", th: "th_TH", id: "id_ID", vi: "vi_VN" };

// 某個語言下某條路徑的網址路徑，path 以 / 開頭
export const localePath = (locale: string, path: string) => (locale === routing.defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`);

export const languageAlternates = (path: string) => ({
  ...Object.fromEntries(routing.locales.map((l) => [l, `${SITE_URL}${localePath(l, path)}`])),
  "x-default": `${SITE_URL}${localePath(routing.defaultLocale, path)}`,
});

type PageSeo = {
  locale: string;
  path: string;
  title: string;
  description?: string;
  // 分享卡片圖：相對網址或絕對網址；不給就用語言段的預設分享圖（opengraph-image）
  image?: string;
  // 首頁等不套「頁名 · Idolca」模板的標題
  absoluteTitle?: boolean;
  noindex?: boolean;
};

export function pageMetadata({ locale, path, title, description, image, absoluteTitle, noindex }: PageSeo): Metadata {
  const images = image ? [{ url: image }] : undefined;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: localePath(locale, path), languages: languageAlternates(path) },
    openGraph: { title, description, url: localePath(locale, path), siteName: "Idolca", type: "website", locale: OG_LOCALE[locale], ...(images ? { images } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(images ? { images } : {}) },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

// 結構化資料（JSON-LD），放進頁面讓搜尋結果顯示網站名稱、站內搜尋框和商品資訊
export const jsonLd = (data: object) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });
