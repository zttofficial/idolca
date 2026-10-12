// 穩定幣金額的顯示格式。只顯示鏈上結算用的穩定幣，不換算當地貨幣（沒有即時匯率就不顯示參考價）
// 不指定小數位時：整數不帶小數，有零頭的價格（如賣家標的 42.5）顯示到分
export function formatStable(amount: number, symbol: string, fractionDigits = Number.isInteger(amount) ? 0 : 2) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${symbol}`;
}

export const formatUsdt = (amount: number, fractionDigits?: number) => formatStable(amount, "USDT", fractionDigits);
