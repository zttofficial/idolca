import { createHmac } from "node:crypto";
import { pickIndex } from "./packs";

// 抽卡的公平性計算（承諾—揭示），伺服器抽卡和任何人事後核對都用這一份：
// r = HMAC-SHA256(種子, 付款證明:序號)，位置 = floor(r 前 12 位十六進位 / 2^48 × 當時卡池大小)，
// 卡池按編號排序後的第「位置」張就是抽中的卡。付款證明是買家產生、平台事先算不出來的簽名：
// Solana 付款是付款交易的簽名，Arc 付款是買家對 USDC 授權轉帳的簽名
export const drawRandom = (seed: string, proof: string, idx: number) => createHmac("sha256", seed).update(`${proof}:${idx}`).digest("hex");

export function verifyDraw(seed: string, d: { proof: string; idx: number; poolSize: number; pick: number; r: string }) {
  const r = drawRandom(seed, d.proof, d.idx);
  return r === d.r && pickIndex(r, d.poolSize) === d.pick;
}
