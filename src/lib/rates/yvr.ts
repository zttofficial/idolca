// 溫哥華金庫（YVR）的寄件價目：寄一張卡（卡套加硬殼卡套裝氣泡袋，實重和體積重都在 100g 內）到各地的郵資，加幣。
// 計價規則和換算見 src/lib/shipping.ts；郵局調價、燃油附加費或匯率變動時改這個檔。
//
// 寄法：國外用加拿大郵政 Tracked Packet（有追蹤），加拿大國內用掛號信（Lettermail 加 Registered Mail，有追蹤和簽收）。
// 價目來源：加拿大郵政〈Solutions for Small Business〉價目表 https://www.canadapost-postescanada.ca/cpc/doc/en/support/prices/business-prices.pdf
// （文件更新於 2026-09-07；Tracked Packet 價格 Effective June 26, 2025，國家和 rate code 對照 Effective September 7, 2026；Lettermail Effective January 13, 2025）。
// Tracked Packet 只寄下面列出的國家：泰國、印尼、越南、菲律賓、澳門不在服務範圍內，後台出貨必須填物流單號，所以溫哥華的卡不寄這幾個地方。

export const YVR_SERVICE = "Canada Post Tracked Packet / Registered Mail";

// 國際小包的燃油附加費（USA and International Packet Services），按郵資加收。加拿大郵政每週一調整，
// 2026-10-12 至 10-18 為 25.25%（https://www.canadapost-postescanada.ca/cpc/en/support/kb/company-policies/rates-taxes-surcharges/fuel-surcharges-on-mail-and-parcels.page，2026-10-14 查詢）。
// 國內掛號信不收燃油附加費（附加費只適用包裹和小包）
export const YVR_PACKET_FUEL_SURCHARGE = 0.2525;

// Tracked Packet – International，0.1kg 以內，rate code 1 到 16 的價格（價目表第 54 頁）
const INTL_100G = [21.23, 22.37, 29.04, 24.85, 25.41, 29.02, 28.17, 29.51, 27.58, 31.49, 22.26, 22.37, 22.37, 24.85, 25.41, 28.73];
// 國家對應的 rate code（價目表第 53 頁）
const INTL_RATE_CODE: Record<string, number> = {
  AU: 15,
  BE: 2,
  BR: 7,
  CN: 9,
  FR: 12,
  DE: 13,
  HK: 4,
  IE: 2,
  IT: 2,
  JP: 14,
  MY: 4,
  MX: 1,
  NL: 2,
  NZ: 5,
  PL: 3,
  SG: 4,
  KR: 4,
  ES: 2,
  SE: 2,
  TW: 4,
  GB: 11,
};
// Tracked Packet – USA，0.1kg 以內，所有州同價（價目表第 42 頁）
const USA_100G = 8.19;
// 加拿大國內：Lettermail 非標準件 50 到 100g 2.61（郵資機或郵資已付戳記；單張郵票同價），加 Registered Mail 13.15（價目表第 30 頁），全國同價。
// 包裹（Regular Parcel、Expedited Parcel 最低一檔 0.5kg）按起訖地區分 128 個 rate code，9.68 到 20.80，再加國內燃油附加費（2026-10-12 起 48%，
// 暫時減免後 40.8%），從溫哥華寄到多數地區都比掛號信貴，所以國內一律寄掛號信
const DOMESTIC_100G = 2.61 + 13.15;

const packet = (cad: number) => cad * (1 + YVR_PACKET_FUEL_SURCHARGE);

// 郵資（加幣，含燃油附加費）。不寄的地方不列
export const YVR_POSTAGE_CAD: Record<string, number> = {
  CA: DOMESTIC_100G,
  US: packet(USA_100G),
  ...Object.fromEntries(Object.entries(INTL_RATE_CODE).map(([country, code]) => [country, packet(INTL_100G[code - 1])])),
};

// 一張卡的包材（加幣）：卡套和硬殼卡套各一，按 401 Games 的 Ultra Pro Toploader 100ct - Regular Toploader & Card Sleeves 19.95 / 100 組
// （https://store.401games.ca/products/ultra-pro-toploader-100ct-regular-toploader-card-sleeves）；
// 氣泡袋按 Uline Canada 的 #000 4 x 8" 氣泡袋 S-8059 一箱 500 個 130.00（https://www.uline.ca/Product/Detail/S-8059/Self-Seal-Bubble-Mailers/Uline-Bubble-Lined-Polyolefin-Mailers-000-4-x-8）。2026-10-14 查詢
export const YVR_PACKING_CAD = 19.95 / 100 + 130 / 500;

// 加幣兌美元：加拿大央行 2026-10-14 的 USD/CAD 日均匯率（https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json）
export const CAD_PER_USD = 1.4263;
