// 當地貨幣參考價。匯率是手填的近似值，只用於懸停提示；接入匯率 API 前不要用它結算。
export const USDT_RATES = {
  KRW: 1390,
  JPY: 149,
  CNY: 7.1,
  TWD: 31.8,
  HKD: 7.78,
  THB: 33.6,
  IDR: 16350,
  VND: 26100,
  USD: 1,
} as const;

export type FiatCode = keyof typeof USDT_RATES;

// 按語言挑參考貨幣（站點語言或瀏覽器語言都可）；沒有對應的一律顯示美元
const LOCALE_CURRENCY: [RegExp, FiatCode][] = [
  [/^ko/i, "KRW"],
  [/^ja/i, "JPY"],
  [/^zh-(hk|mo)/i, "HKD"],
  [/^zh-(tw|hant)/i, "TWD"],
  [/^zh/i, "CNY"],
  [/^th/i, "THB"],
  [/^id/i, "IDR"],
  [/^vi/i, "VND"],
];

export function currencyForLocale(locale: string): FiatCode {
  return LOCALE_CURRENCY.find(([re]) => re.test(locale))?.[1] ?? "USD";
}

export function formatFiat(usdt: number, locale: string) {
  const code = currencyForLocale(locale);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    maximumFractionDigits: code === "USD" || code === "HKD" || code === "TWD" ? 2 : 0,
  }).format(usdt * USDT_RATES[code]);
}

// 不指定小數位時：整數不帶小數，有零頭的價格（如賣家標的 42.5）顯示到分
export function formatUsdt(amount: number, fractionDigits = Number.isInteger(amount) ? 0 : 2) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} USDT`;
}
