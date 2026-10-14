// 寄件的物流單號（擔保交易賣家寄出、金庫卡提貨平台寄出共用），瀏覽器和伺服器共用：物流商清單、單號整理和驗證、查詢連結。
// 物流商名稱用品牌原名不翻譯；清單外的寄法選「其他」，只存單號、不附查詢連結

type Carrier = { name: string; postal?: boolean; url?: (n: string) => string };

// 先列兩個金庫出貨用的郵政（溫哥華、重慶），再列韓國（貨源地，賣家常用）和寄往主要市場常用的郵政和國際快遞。
// postal：郵政單位，國際郵件的單號是 UPU S10 格式（兩個字母、9 位數字含檢查碼、兩個字母的國家代碼），會核對檢查碼
const CARRIER_TABLE = {
  canadapost: { name: "Canada Post", postal: true, url: (n) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${n}` },
  chinapost: { name: "China Post 中国邮政", postal: true },
  // 重慶金庫寄中國大陸國內用韻達
  yunda: { name: "Yunda 韵达快递" },
  koreapost: {
    name: "Korea Post 우체국",
    postal: true,
    // 國際郵件（EMS、K-Packet、國際掛號）和國內包裹分兩個查詢頁
    url: (n) =>
      S10.test(n) ? `https://service.epost.go.kr/trace.RetrieveEmsRigiTraceList.comm?POST_CODE=${n}` : `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${n}`,
  },
  cj: { name: "CJ Logistics 대한통운", url: (n) => `https://trace.cjlogistics.com/next/tracking.html?wblNo=${n}` },
  hanjin: { name: "Hanjin 한진택배", url: (n) => `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=${n}` },
  lotte: { name: "Lotte 롯데택배", url: (n) => `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${n}` },
  cvsnet: { name: "GS25 / CU 편의점택배" },
  japanpost: { name: "Japan Post 日本郵便", postal: true, url: (n) => `https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=${n}&locale=en` },
  chunghwapost: { name: "Chunghwa Post 中華郵政", postal: true },
  cvstw: { name: "7-ELEVEN / FamilyMart 超商寄件" },
  sf: { name: "SF Express 順豐" },
  usps: { name: "USPS", url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}` },
  dhl: { name: "DHL Express", url: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}` },
  fedex: { name: "FedEx", url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  ups: { name: "UPS", url: (n) => `https://www.ups.com/track?tracknum=${n}` },
} satisfies Record<string, Carrier>;

export type CarrierId = keyof typeof CARRIER_TABLE;
export const CARRIERS = Object.keys(CARRIER_TABLE) as CarrierId[];
const isCarrier = (v: unknown): v is CarrierId => typeof v === "string" && Object.hasOwn(CARRIER_TABLE, v);
export const carrierName = (id: CarrierId) => CARRIER_TABLE[id].name;

// carrier 是 null 表示「其他」
export type Tracking = { carrier: CarrierId | null; number: string };

const S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
// UPU S10 的檢查碼：前 8 位數字乘 8,6,4,2,3,5,9,7 加總，11 減餘數；得 10 時為 0、得 11 時為 5
export function s10Valid(n: string) {
  if (!S10.test(n)) return false;
  const digits = n.slice(2, 10).split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * [8, 6, 4, 2, 3, 5, 9, 7][i], 0);
  const check = 11 - (sum % 11);
  return (check === 10 ? 0 : check === 11 ? 5 : check) === Number(n[10]);
}

// 整理單號：去掉空白和連字號（收據上常分段印），轉大寫
export const normalizeTrackingNumber = (raw: string) => raw.replace(/[\s-]/g, "").toUpperCase();

// 驗證並整理；不合格回 null。單號只能有英文字母和數字，6 到 40 個字元；郵政單位的國際郵件單號要過檢查碼，擋下抄錯一位的
export function parseTracking(raw: unknown): Tracking | null {
  if (!raw || typeof raw !== "object") return null;
  const { carrier, number } = raw as { carrier?: unknown; number?: unknown };
  if (typeof number !== "string") return null;
  if (carrier != null && carrier !== "" && !isCarrier(carrier)) return null;
  const id = isCarrier(carrier) ? carrier : null;
  const n = normalizeTrackingNumber(number);
  if (!/^[A-Z0-9]{6,40}$/.test(n)) return null;
  if (id && "postal" in CARRIER_TABLE[id] && S10.test(n) && !s10Valid(n)) return null;
  return { carrier: id, number: n };
}

// 物流商的公開查詢頁；不認得的物流商或沒有可帶單號的查詢頁時回 null，只顯示單號
export function trackingUrl(t: Tracking): string | null {
  if (!t.carrier) return null;
  const c: Carrier = CARRIER_TABLE[t.carrier];
  return c.url ? c.url(encodeURIComponent(t.number)) : null;
}

// 資料庫存成兩欄（tracking_carrier、tracking_number），讀出來組回物件
export const trackingOf = (carrier: string | null, number: string | null): Tracking | null => (number ? { carrier: isCarrier(carrier) ? carrier : null, number } : null);
