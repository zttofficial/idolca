import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";

// 語言從根路由參數 [locale] 讀取，不依賴請求頭，頁面可以靜態預渲染
export default getRequestConfig(async () => {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) notFound();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
