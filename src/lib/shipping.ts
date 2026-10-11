// 提貨寄送：收件地址的欄位和驗證（瀏覽器和伺服器共用），以及運費。
// 運費在申請提貨的同一筆交易裡付給平台，用 NEXT_PUBLIC_REDEEM_FEE_USDT 設定（預設 5 USDT，含追蹤號的國際掛號）

export const REDEEM_FEE_USDT = (() => {
  const v = Number(process.env.NEXT_PUBLIC_REDEEM_FEE_USDT);
  return Number.isFinite(v) && v >= 0 ? v : 5;
})();

// 可以寄送的國家／地區（ISO 3166-1 alpha-2）
export const SHIP_COUNTRIES = ["KR", "JP", "TW", "HK", "MO", "SG", "MY", "TH", "ID", "VN", "PH", "AU", "NZ", "US", "CA", "MX", "BR", "GB", "IE", "FR", "DE", "NL", "BE", "ES", "IT", "SE", "PL"] as const;

export type ShippingAddress = {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

export const EMPTY_ADDRESS: ShippingAddress = { name: "", phone: "", line1: "", line2: "", city: "", region: "", postal: "", country: "" };

const LIMITS: Record<keyof ShippingAddress, [number, number]> = {
  name: [1, 80],
  phone: [5, 30],
  line1: [1, 120],
  line2: [0, 120],
  city: [1, 60],
  region: [0, 60],
  postal: [0, 20],
  country: [2, 2],
};

// 驗證並整理；不合格回 null
export function parseAddress(raw: unknown): ShippingAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const out = { ...EMPTY_ADDRESS };
  for (const key of Object.keys(LIMITS) as (keyof ShippingAddress)[]) {
    const v = (raw as Record<string, unknown>)[key];
    const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
    const [min, max] = LIMITS[key];
    if (s.length < min || s.length > max) return null;
    out[key] = s;
  }
  out.country = out.country.toUpperCase();
  if (!(SHIP_COUNTRIES as readonly string[]).includes(out.country)) return null;
  if (!/^[+\d][\d\s()-]{4,}$/.test(out.phone)) return null;
  return out;
}

export const formatAddress = (a: ShippingAddress) => [a.name, a.phone, a.line1, a.line2, [a.city, a.region, a.postal].filter(Boolean).join(", "), a.country].filter(Boolean).join("\n");
