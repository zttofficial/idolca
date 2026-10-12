// 穩定幣金額的顯示格式。只顯示鏈上結算用的穩定幣，不換算當地貨幣（沒有即時匯率就不顯示參考價）
// 不指定小數位時：整數不帶小數，有零頭的價格（如賣家標的 42.5）顯示到分
export function formatStable(amount: number, symbol: string, fractionDigits = Number.isInteger(amount) ? 0 : 2) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${symbol}`;
}

// 價格的計價幣種：每個部署按所在司法管轄區設定 NEXT_PUBLIC_CURRENCY（USDT、USDC 等美元穩定幣），留空為 USDT。
// 金額本身是以美元穩定幣計的數字，換幣種不換算
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || "USDT";

export const formatPrice = (amount: number, fractionDigits?: number) => formatStable(amount, CURRENCY, fractionDigits);
