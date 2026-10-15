// 平台規則的數字，服務條款、隱私權政策和伺服器邏輯共用同一份

// 成交抽成（基點）：金庫卡一口價成交（鏈上 Config，由 npm run chain:setup-market 同步）和擔保交易共用
export const FEE_BPS = 250;
// 擔保交易：付款後幾天內要寄出，寄出後幾天自動放款
export const ESCROW_SHIP_DAYS = 7;
export const ESCROW_CONFIRM_DAYS = 14;
// 買家付款後幾天內沒填收件地址，訂單自動取消並全額退款（拍賣得標的訂單也一樣）
export const ESCROW_ADDRESS_DAYS = 7;
// 提貨收件地址在寄出後保留幾天
export const ADDRESS_RETENTION_DAYS = 90;
// 拍賣：賣家手續費（基點）、起標價下限（USD）、可選的拍賣天數、截止前幾分鐘內有人出價就把截止時間延到出價後同樣的分鐘數。
// 金庫卡拍賣的這幾項也寫在鏈上的 AuctionConfig（npm run chain:setup-market 按這裡設定），兩邊要一致
export const AUCTION_FEE_BPS = 400;
export const AUCTION_MIN_START = 10;
export const AUCTION_DAYS = [1, 3, 5, 7] as const;
export const AUCTION_EXTEND_MINUTES = 5;
// 用戶自己把收藏卡做成數位珍藏時收的鑄造費（USD，用 USDT 或 USDC 付）：平台代付 NFT 帳戶的押金和手續費（約 0.003 SOL），收這筆抵成本
export const MINT_FEE_USD = 0.5;
// 提貨運費 =（卡所在金庫寄到該國的郵資 + 包材）×（1 + REDEEM_FEE_BUFFER），按那個金庫的匯率換成美元，無條件進位到 REDEEM_FEE_STEP_USD 的倍數
// （郵資表在 src/lib/rates/，計算在 src/lib/shipping.ts）。緩衝吸收匯率波動、燃油附加費和郵局調價，不是利潤
export const REDEEM_FEE_BUFFER = 0.15;
export const REDEEM_FEE_STEP_USD = 0.5;
// 加拿大境內的提貨（溫哥華金庫寄加拿大）另收 GST/HST：稅 = 運費 × 收件省份的稅率，四捨五入到分（稅率在 src/lib/rates/ca-tax.ts，計算在 src/lib/shipping.ts 的 redeemCharge）。
// 國際件不收：寄出加拿大和兩地都在國外的寄送服務適用零稅率（Excise Tax Act Schedule VI Part VII 第 6、8、9 條，見 CRA GST/HST Memorandum 28-2）
