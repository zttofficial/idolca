// 外部評級：Idolca 自己只鑑定真偽、不打分，分數一律來自評級機構，連同機構和鑑定編號一起記錄，
// 卡片頁、卡面、NFT 屬性都顯示成「PSA 10 · #編號」。有公開查詢頁的機構附查詢連結

export type GraderId = "psa" | "cgc" | "brg" | "pocagrades";

export const GRADERS: { id: GraderId; name: string; lookup?: (cert: string, score: number) => string }[] = [
  { id: "psa", name: "PSA", lookup: (cert) => `https://www.psacard.com/cert/${encodeURIComponent(cert)}` },
  { id: "cgc", name: "CGC", lookup: (cert, score) => `https://www.cgccards.com/certlookup/${encodeURIComponent(cert)}/${score.toFixed(1).replace(".", "_")}/` },
  { id: "brg", name: "BRG" },
  { id: "pocagrades", name: "Pocagrades" },
];

export type Grade = { grader: GraderId; score: number; cert: string };

const graderOf = (id: string) => GRADERS.find((g) => g.id === id);

export const gradeLabel = (g: Grade) => `${graderOf(g.grader)?.name ?? g.grader} ${g.score}`;
export const gradeLookupUrl = (g: Grade) => graderOf(g.grader)?.lookup?.(g.cert, g.score) ?? null;

// 後台入庫表單送來的評級：沒選機構就是沒有送評（表單切回「未送評」時殘留的分數和編號不算）；
// 選了機構就要有分數（1–10、以 0.5 為單位）和鑑定編號
export function parseGrade(body: Record<string, unknown>): { grade: Grade | null } | { error: "invalid_grade" } {
  const grader = typeof body.grader === "string" ? body.grader.trim() : "";
  if (!grader) return { grade: null };
  const rawScore = body.gradeScore;
  const score = rawScore === undefined || rawScore === null || rawScore === "" ? NaN : Number(rawScore);
  const cert = typeof body.gradeCert === "string" ? body.gradeCert.trim() : "";
  if (!graderOf(grader) || !(score >= 1 && score <= 10 && Number.isInteger(score * 2)) || !/^[A-Za-z0-9-]{3,40}$/.test(cert)) return { error: "invalid_grade" };
  return { grade: { grader: grader as GraderId, score, cert } };
}
