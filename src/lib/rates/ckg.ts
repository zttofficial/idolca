import type { RateSource } from "./source";

// 重慶金庫（CKG）的寄件價目：寄一張卡（卡套加硬殼卡套裝氣泡袋，實重和體積重都在 100g 內）到各地的郵資，人民幣。
// 計價規則和換算見 src/lib/shipping.ts；郵局調價或匯率變動時改這個檔。
//
// 寄法：國外和香港用中國郵政國際 e 郵寶（ePacket，有追蹤，按首克加每克計費）；e 郵寶不到台灣和澳門，改用中國郵政 e 特快（有追蹤）；
// 中國大陸國內用韻達普快件。國際掛號小包的報價工具從重慶查不到，2021 年價目表上也比 e 郵寶貴（美國 100g 約 48 元、日本約 31 元），所以不用。
// e 郵寶和 e 特快要在中國郵政協議客戶門戶（https://my.ems.com.cn）註冊並在線打單；實際收費以當地郵政簽的協議為準。
//
// 國際和港澳台價格來源：中國郵政協議客戶門戶的報價工具 https://my.ems.com.cn/pcp-web/f/pcp/indexController/toquoteindex
// （寄件地 重慶市渝中區、重量 100 克、2026-10-14 查詢），取「國際(地區)E郵寶物品經濟時限」或「國際(地區)E特快物品」的總資費。
// e 郵寶的通達國家見 https://my.ems.com.cn/pcp-web/intl/shipping/product/product_4.html（最小尺寸 14×11 cm，氣泡袋要選夠大的）。
const EPACKET_100G: Record<string, number> = {
  KR: 13.6,
  JP: 21.3,
  HK: 14.1,
  SG: 14.9,
  MY: 14.6,
  TH: 14.6,
  ID: 15.5,
  VN: 13,
  PH: 13,
  AU: 31.2,
  NZ: 24.5,
  US: 39,
  CA: 58,
  MX: 21.5,
  BR: 32.2,
  GB: 32.5,
  IE: 36.5,
  FR: 28.2,
  DE: 31.2,
  NL: 35.2,
  BE: 37.2,
  ES: 24,
  IT: 36.2,
  SE: 29.6,
  PL: 27,
};
// e 特快（首重 50 克加續重每 50 克）：台灣 16 + 0.7，澳門 60 + 1
const EMS_E_100G: Record<string, number> = { TW: 16.7, MO: 61 };
// 中國大陸國內：韻達官網運費查詢 https://web.yundaex.com/FreightInquiry（起寄 重慶、0.1kg、普快件、2026-10-14 查詢）。
// 重慶市內 8 元，多數省會 12 元，東北 15、內蒙古 18、西藏 18、新疆 20；全國按一個價，取最高的 20 元，寄到哪都不虧
const DOMESTIC_100G = 20;

export const CKG_SERVICE = "China Post ePacket / e-EMS, Yunda Express (domestic)";

// 郵資（人民幣）。不寄的地方不列
export const CKG_POSTAGE_CNY: Record<string, number> = { CN: DOMESTIC_100G, ...EPACKET_100G, ...EMS_E_100G };

// 一張卡的包材（人民幣），取 1688 商品列表的公開起批價（量大檔，2026-10-14 查詢）：
// 卡膜 0.06（https://detail.1688.com/offer/732322858230.html，列表 https://tw.1688.com/item/-D0A1BFA8BFA8C4A4.html），
// 35PT 硬卡套 0.16（https://detail.1688.com/offer/635432448979.html，列表 https://tw.1688.com/item/-D3B2BFA8CCD7.html），
// 複合珠光膜氣泡信封袋 0.05（https://detail.1688.com/offer/558935322669.html，列表 https://tw.1688.com/item/-C6F8C5DDD0C5B7E2B4FC.html）
export const CKG_PACKING_CNY = 0.06 + 0.16 + 0.05;

// 人民幣兌美元：中國外匯交易中心受權公布的 2026-10-14 人民幣匯率中間價 USD/CNY
// （https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json）
export const CNY_PER_USD = 6.7249;

// 運費表頁列出的報價來源和查詢日期，和上面註解裡的網址一致；改價目時一起改
export const CKG_QUOTED_ON = "2026-10-14";
export const CKG_SOURCES: readonly RateSource[] = [
  { kind: "postage", name: "China Post 中国邮政 · ePacket / e-EMS quote from Chongqing", url: "https://my.ems.com.cn/pcp-web/f/pcp/indexController/toquoteindex" },
  { kind: "postage", name: "Yunda 韵达快递 · freight inquiry from Chongqing", url: "https://web.yundaex.com/FreightInquiry" },
  { kind: "packing", name: "1688 · card sleeves", url: "https://detail.1688.com/offer/732322858230.html" },
  { kind: "packing", name: "1688 · 35pt toploaders", url: "https://detail.1688.com/offer/635432448979.html" },
  { kind: "packing", name: "1688 · bubble mailers", url: "https://detail.1688.com/offer/558935322669.html" },
  { kind: "fx", name: "CFETS 中国外汇交易中心 · USD/CNY central parity", url: "https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json" },
];
