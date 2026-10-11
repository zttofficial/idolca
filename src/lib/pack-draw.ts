import { createHmac } from "node:crypto";
import { pickIndex } from "./packs";

// 抽卡的公平性計算（承諾—揭示），伺服器抽卡和任何人事後核對都用這一份：
// r = HMAC-SHA256(種子, 付款交易簽名:序號)，位置 = floor(r 前 12 位十六進位 / 2^48 × 當時卡池大小)，
// 卡池按編號排序後的第「位置」張就是抽中的卡
export const drawRandom = (seed: string, payTx: string, idx: number) => createHmac("sha256", seed).update(`${payTx}:${idx}`).digest("hex");

export function verifyDraw(seed: string, d: { payTx: string; idx: number; poolSize: number; pick: number; r: string }) {
  const r = drawRandom(seed, d.payTx, d.idx);
  return r === d.r && pickIndex(r, d.poolSize) === d.pick;
}
