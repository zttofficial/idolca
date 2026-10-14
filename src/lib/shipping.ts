// 提貨寄送：收件地址的欄位和驗證（瀏覽器和伺服器共用），以及按（卡所在的金庫，目的地）計價的運費。
// 運費在申請提貨的同一筆交易裡付給平台；伺服器組交易和對帳都從資料庫讀卡所在的金庫，用 redeemFeeUsd(金庫, 收件國家) 算，不採用前端傳來的金額
import { REDEEM_FEE_BUFFER, REDEEM_FEE_STEP_USD } from "./policy";
import { VAULTS, VAULT_LIST, isVaultId } from "./vaults";

// 收件地址可選的國家／地區（ISO 3166-1 alpha-2）：目標市場（擔保交易由賣家自己寄，不受金庫的寄法限制），加上任一金庫寄得到的地方。
// 提貨表單只列卡所在金庫寄得到的（vaultCountries）
const MARKETS = ["KR", "JP", "TW", "HK", "MO", "CN", "SG", "MY", "TH", "ID", "VN", "PH", "AU", "NZ", "US", "CA", "MX", "BR", "GB", "IE", "FR", "DE", "NL", "BE", "ES", "IT", "SE", "PL"];
export const SHIP_COUNTRIES: readonly string[] = [...new Set([...MARKETS, ...VAULT_LIST.flatMap((v) => Object.keys(v.postage))])].sort();

export const isShipCountry = (country: string) => SHIP_COUNTRIES.includes(country);

// 這個金庫寄得到的國家
export const vaultCountries = (vault: string): readonly string[] => (isVaultId(vault) ? Object.keys(VAULTS[vault].postage).sort() : []);

// 從某金庫寄到某國的提貨運費（USD）：（郵資 + 包材）加上緩衝，換成美元後無條件進位到 REDEEM_FEE_STEP_USD（規則見 src/lib/policy.ts）。
// 不認得的金庫、那個金庫不寄的地方回 null
export function redeemFeeUsd(vault: string, country: string): number | null {
  if (!isVaultId(vault)) return null;
  const v = VAULTS[vault];
  if (!Object.hasOwn(v.postage, country)) return null;
  const usd = ((v.postage[country] + v.packing) * (1 + REDEEM_FEE_BUFFER)) / v.perUsd;
  // 先去掉浮點誤差再進位，免得剛好落在一檔上的金額被多進一檔
  return Math.ceil(Number((usd / REDEEM_FEE_STEP_USD).toFixed(6))) * REDEEM_FEE_STEP_USD;
}

// 兩個金庫所有可寄送地方裡最低和最高的運費，服務條款用
export const REDEEM_FEE_RANGE = (() => {
  const fees = VAULT_LIST.flatMap((v) => vaultCountries(v.id).map((c) => redeemFeeUsd(v.id, c)!));
  return { min: Math.min(...fees), max: Math.max(...fees) };
})();

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
  if (!isShipCountry(out.country)) return null;
  if (!/^[+\d][\d\s()-]{4,}$/.test(out.phone)) return null;
  return out;
}

export const formatAddress = (a: ShippingAddress) => [a.name, a.phone, a.line1, a.line2, [a.city, a.region, a.postal].filter(Boolean).join(", "), a.country].filter(Boolean).join("\n");
