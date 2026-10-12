import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { routing } from "./routing";
import { CURRENCY } from "@/lib/fx";

// 文案裡的 {currency} 是部署設定的計價幣種（見 src/lib/fx.ts），載入時直接換掉，呼叫 t() 時不用另外傳
type Messages = { [key: string]: string | Messages };
const withCurrency = (m: Messages): Messages =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, typeof v === "string" ? v.replaceAll("{currency}", CURRENCY) : withCurrency(v)]));

// 語言從根路由參數 [locale] 讀取，不依賴請求頭，頁面可以靜態預渲染
export default getRequestConfig(async () => {
  const locale = await rootParams.locale();
  if (!hasLocale(routing.locales, locale)) notFound();
  return {
    locale,
    messages: withCurrency((await import(`../../messages/${locale}.json`)).default),
  };
});
