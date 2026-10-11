import "server-only";

// 卡包（有隨機性的付費抽卡）在部分地區受限。PACKS_BLOCKED_COUNTRIES 是逗號分隔的 ISO 國家代碼，
// 預設擋比利時和荷蘭（當地把付費隨機抽獎視為賭博）；上線前由法務按營運地確認清單。
// 國家由 Vercel 的 x-vercel-ip-country 頭判斷，本機沒有這個頭，不擋
const blocked = () =>
  new Set(
    (process.env.PACKS_BLOCKED_COUNTRIES ?? "BE,NL")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );

export const countryOf = (headers: Headers) => headers.get("x-vercel-ip-country")?.toUpperCase() ?? null;

export function packsBlockedIn(request: Request | Headers) {
  const country = countryOf(request instanceof Request ? request.headers : request);
  return country !== null && blocked().has(country);
}
