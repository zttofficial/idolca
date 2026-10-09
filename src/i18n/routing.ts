import { defineRouting } from "next-intl/routing";

// 英文是默認語言，網址不帶前綴（/vault）；其他語言帶前綴（/zh-Hant/vault）。
// 不按瀏覽器語言自動跳轉，一律先進英文版，由用戶在語言選單裡切換
export const routing = defineRouting({
  locales: ["en", "zh-Hant", "zh-Hans", "ja", "ko", "th", "id", "vi"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

// 語言選單裡用各語言自己的名字
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
  "zh-Hans": "简体中文",
  ja: "日本語",
  ko: "한국어",
  th: "ไทย",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
};
