// 穩定幣金額的顯示格式。只顯示鏈上結算用的穩定幣，不換算當地貨幣（沒有即時匯率就不顯示參考價）
// 不指定小數位時：整數不帶小數，有零頭的價格（如賣家標的 42.5）顯示到分
export function formatStable(amount: number, symbol: string, fractionDigits = Number.isInteger(amount) ? 0 : 2) {
  return `${amount.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} ${symbol}`;
}

// 價格一律以美元標示；實際用哪種美元穩定幣付款看付款方式（Solana 上的 USDT、Arc 上的 USDC），1:1 不換算
export const CURRENCY = "USD";

export const formatPrice = (amount: number, fractionDigits?: number) => formatStable(amount, CURRENCY, fractionDigits);
