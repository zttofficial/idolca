// 平台規則的數字，服務條款、隱私權政策和伺服器邏輯共用同一份

// 成交抽成（基點）：金庫卡一口價成交（鏈上 Config，由 npm run chain:setup-market 同步）和擔保交易共用
export const FEE_BPS = 250;
// 擔保交易：付款後幾天內要寄出，寄出後幾天自動放款
export const ESCROW_SHIP_DAYS = 7;
export const ESCROW_CONFIRM_DAYS = 14;
// 提貨收件地址在寄出後保留幾天
export const ADDRESS_RETENTION_DAYS = 90;
// 拍賣：賣家手續費（基點）、起標價下限（USD）、可選的拍賣天數、截止前幾分鐘內有人出價就把截止時間延到出價後同樣的分鐘數。
// 金庫卡拍賣的這幾項也寫在鏈上的 AuctionConfig（npm run chain:setup-market 按這裡設定），兩邊要一致
export const AUCTION_FEE_BPS = 400;
export const AUCTION_MIN_START = 10;
export const AUCTION_DAYS = [1, 3, 5, 7] as const;
export const AUCTION_EXTEND_MINUTES = 5;
