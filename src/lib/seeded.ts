// 以字串為種子的確定性隨機數，同一張卡每次生成的佔位圖和樣本資料都一樣
export function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// 形似 Solana 地址（44 位）或交易簽名（88 位）的假字串
export function fakeBase58(rand: () => number, length: number) {
  let out = "";
  for (let i = 0; i < length; i++) out += BASE58[Math.floor(rand() * 58)];
  return out;
}
