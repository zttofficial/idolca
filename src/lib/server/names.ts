// 用戶自填文字的冒充檢查：暱稱不能用平台、管理員、客服這類名稱；刊登標題和描述不能自稱平台官方或客服。
// 比對前先正規化：NFKC（全形、相容字元轉成一般字元）、轉小寫、常見的數字代字母還原、去掉空白和符號，
// 擋掉「Ad min」「ADM1N」「ｉｄｏｌｃａ」這類寫法

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i", "|": "l" };

export const normalizeForMatch = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[013457@$!|]/g, (c) => LEET[c])
    .replace(/[^\p{L}\p{N}]/gu, "");

const BRAND = ["idolca", "idoica"];

// 暱稱裡出現就不行
const RESERVED_PARTS = [
  ...BRAND,
  "admin",
  "moderator",
  "official",
  "support",
  "staff",
  "helpdesk",
  "customerservice",
  "sysop",
  "管理員",
  "管理员",
  "管理者",
  "官方",
  "客服",
  "版主",
  "運營",
  "运营",
  "公式",
  "運営",
  "サポート",
  "スタッフ",
  "관리자",
  "운영자",
  "운영진",
  "공식",
  "고객센터",
];

// 整個暱稱等於這些才不行（拿來當片段會誤傷 modern、rooted 這類正常名字）
const RESERVED_EXACT = new Set(["mod", "root", "system", "operator", "team", "null", "undefined", "anonymous", "deleted", "unknown", "everyone", "here", "系統", "系统"]);

export function isReservedName(name: string) {
  const n = normalizeForMatch(name);
  return RESERVED_EXACT.has(n) || RESERVED_PARTS.some((p) => n.includes(p));
}

// 刊登標題和描述：卡片常寫「official photocard」，所以只擋平台名和權威詞連在一起的寫法，以及詐騙常用的「官方客服」「平台客服」
const AUTHORITY = ["official", "admin", "support", "staff", "team", "moderator", "官方", "客服", "管理", "團隊", "团队", "公式", "運営", "공식", "운영", "관리자", "고객센터"];
const SCAM_PHRASES = ["官方客服", "平台客服", "平台官方", "官方人員", "官方人员"];

export function impersonatesPlatform(text: string) {
  const n = normalizeForMatch(text);
  if (SCAM_PHRASES.some((p) => n.includes(p))) return true;
  return BRAND.some((b) => AUTHORITY.some((w) => n.includes(b + w) || n.includes(w + b)));
}

// 暱稱：2–24 個字，去掉頭尾空白、連續空白併成一個，不收控制字元；管理員不受保留名稱限制
export const NAME_MIN = 2;
export const NAME_MAX = 24;

export function cleanName(v: unknown): string | null {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  const len = [...name].length;
  return len < NAME_MIN || len > NAME_MAX || /[\p{Cc}\p{Cf}]/u.test(name) ? null : name;
}

// 改名頻率：每 3 天一次。註冊時的預設名（郵箱前綴、縮寫的錢包地址）是自動給的，第一次改不受限
export const NAME_COOLDOWN_DAYS = 3;

export function nextRenameAt(nameChangedAt: Date | null) {
  if (!nameChangedAt) return null;
  const next = new Date(nameChangedAt.getTime() + NAME_COOLDOWN_DAYS * 86400_000);
  return next > new Date() ? next : null;
}
