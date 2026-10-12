// 評級：每個分數都連同評級機構和鑑定編號一起記錄，卡片頁、卡面、NFT 屬性都顯示成「PSA 10 · #編號」，
// 有公開查詢頁的機構附查詢連結。Idolca 自家的評級品牌是 Idolca Grading（IDG），鑑定編號就是金庫編號，
// 卡片頁會註明是自家評級，和第三方機構分開

export type GraderId = "idolca" | "psa" | "cgc" | "brg" | "pocagrades";

export const GRADERS: { id: GraderId; name: string; inHouse?: boolean; lookup?: (cert: string, score: number) => string }[] = [
  { id: "idolca", name: "IDG", inHouse: true },
  { id: "psa", name: "PSA", lookup: (cert) => `https://www.psacard.com/cert/${encodeURIComponent(cert)}` },
  { id: "cgc", name: "CGC", lookup: (cert, score) => `https://www.cgccards.com/certlookup/${encodeURIComponent(cert)}/${score.toFixed(1).replace(".", "_")}/` },
  { id: "brg", name: "BRG" },
  { id: "pocagrades", name: "Pocagrades" },
];

export type Grade = { grader: GraderId; score: number; cert: string };

const graderOf = (id: string) => GRADERS.find((g) => g.id === id);

export const gradeLabel = (g: Grade) => `${graderOf(g.grader)?.name ?? g.grader} ${g.score}`;
export const gradeLookupUrl = (g: Grade) => graderOf(g.grader)?.lookup?.(g.cert, g.score) ?? null;
export const isInHouse = (g: Grade) => Boolean(graderOf(g.grader)?.inHouse);

// 後台表單送來的評級：沒選機構就是沒有評級（表單切回「未評級」時殘留的分數和編號不算）；
// 選了機構就要有分數（1–10、以 0.5 為單位）和鑑定編號。自家評級的編號固定用金庫編號 serial
export function parseGrade(body: Record<string, unknown>, serial: string): { grade: Grade | null } | { error: "invalid_grade" } {
  const grader = typeof body.grader === "string" ? body.grader.trim() : "";
  if (!grader) return { grade: null };
  const rawScore = body.gradeScore;
  const score = rawScore === undefined || rawScore === null || rawScore === "" ? NaN : Number(rawScore);
  const cert = graderOf(grader)?.inHouse ? serial : typeof body.gradeCert === "string" ? body.gradeCert.trim() : "";
  if (!graderOf(grader) || !(score >= 1 && score <= 10 && Number.isInteger(score * 2)) || !/^[A-Za-z0-9-]{3,40}$/.test(cert)) return { error: "invalid_grade" };
  return { grade: { grader: grader as GraderId, score, cert } };
}
