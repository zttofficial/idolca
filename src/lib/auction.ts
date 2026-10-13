// 拍賣的共用規則：前端顯示、伺服器驗證和鏈上託管程序（min_next_bid）用同一套加價規則
import { AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START } from "./policy";

export { AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START };

// 下一口最低出價：第一口是起標價；之後 50 元以下至少加 1 元，50 到 200 元至少加 5 元，200 元以上至少加 2.5%（無條件進位）。
// unit 是 1 元等於多少最小單位：自由刊登以分計（100），金庫卡以鏈上代幣的最小單位計（1,000,000）
export function minNextBid(high: number | null, start: number, unit: number) {
  if (high === null) return start;
  const step = high < 50 * unit ? unit : high < 200 * unit ? 5 * unit : Math.ceil((high * 250) / 10_000);
  return high + step;
}

// 拍賣的公開狀態，兩條交易線共用一個面板顯示。金額是 USD
export type AuctionView = {
  lane: "free" | "vault";
  startUsd: number;
  // 有沒有設保底價、目前出價達到了沒有；保底價本身不公開（和 eBay 一樣）
  hasReserve: boolean;
  reserveMet: boolean;
  highUsd: number | null;
  bidCount: number;
  // 下一口最低出價
  minNextUsd: number;
  // 截止時間（ISO）；最後幾分鐘有人出價會往後延
  endsAt: string;
  feeBps: number;
  // live 進行中；settling 已截止、等結標；sold 成交；unsold 流拍；cancelled 賣家取消
  status: "live" | "settling" | "sold" | "unsold" | "cancelled";
};

// 拍賣手續費從賣家所得扣，買家只付得標價
export const auctionFeeCents = (priceCents: number, feeBps = AUCTION_FEE_BPS) => Math.round((priceCents * feeBps) / 10_000);
