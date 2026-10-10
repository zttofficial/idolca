import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { Db } from "./db";
import { media } from "./schema";
import credits from "@/lib/sample-credits.json";
import { sampleId } from "@/lib/sample-image";

// 卡片照片：統一裁成 55:85、轉 JPEG，存進 media 表。
// 原圖（未加浮水印）留給鑑定，對外只提供加了浮水印的展示圖
export const CARD_W = 660;
export const CARD_H = 1020;
export const MAX_UPLOAD = 4_000_000;

// 「ıdolca」的字形輪廓（Geist ExtraBold，1000 單位/em，基線 y=0），不依賴伺服器上的字型
const WORDMARK = "M61 0V-538H233V0Z M502 12Q434 12 386 -22Q337 -57 310 -120Q283 -183 283 -269Q283 -355 310 -418Q337 -481 387 -516Q436 -550 502 -550Q560 -550 601 -526Q642 -503 663 -461V-710H835V0H669L666 -78Q644 -35 601 -12Q558 12 502 12ZM562 -115Q595 -115 617 -132Q640 -149 651 -183Q663 -217 663 -269Q663 -321 651 -355Q640 -389 617 -406Q595 -423 562 -423Q515 -423 488 -382Q460 -340 460 -269Q460 -200 488 -157Q516 -115 562 -115Z M1168 12Q1083 12 1019 -23Q956 -58 921 -121Q885 -184 885 -269Q885 -354 921 -417Q956 -480 1019 -515Q1083 -550 1168 -550Q1253 -550 1316 -515Q1379 -480 1414 -417Q1450 -354 1450 -269Q1450 -184 1414 -121Q1379 -58 1316 -23Q1253 12 1168 12ZM1168 -115Q1218 -115 1246 -155Q1273 -195 1273 -269Q1273 -342 1246 -382Q1218 -423 1168 -423Q1117 -423 1090 -382Q1062 -342 1062 -269Q1062 -195 1090 -155Q1117 -115 1168 -115Z M1652 0Q1580 0 1540 -36Q1500 -72 1500 -153V-710H1672V-172Q1672 -146 1684 -135Q1696 -124 1718 -124H1751V0Z M2039 12Q1953 12 1890 -23Q1827 -58 1792 -121Q1756 -184 1756 -269Q1756 -354 1792 -417Q1827 -479 1890 -515Q1953 -550 2039 -550Q2113 -550 2172 -524Q2231 -497 2268 -449Q2305 -400 2312 -332L2136 -324Q2129 -373 2103 -398Q2077 -422 2039 -422Q1988 -422 1961 -382Q1933 -342 1933 -269Q1933 -195 1961 -155Q1988 -115 2039 -115Q2078 -115 2104 -140Q2131 -165 2136 -218L2312 -212Q2306 -143 2270 -93Q2234 -42 2175 -15Q2116 12 2039 12Z M2518 12Q2434 12 2380 -27Q2326 -66 2326 -135Q2326 -206 2372 -245Q2418 -284 2506 -302L2673 -336Q2673 -383 2653 -407Q2632 -432 2594 -432Q2556 -432 2534 -414Q2513 -395 2507 -361L2335 -367Q2351 -460 2418 -505Q2485 -550 2594 -550Q2720 -550 2783 -493Q2845 -436 2845 -323V-153Q2845 -128 2853 -120Q2862 -112 2877 -112H2890V0Q2882 3 2864 5Q2846 7 2829 7Q2798 7 2769 -4Q2740 -14 2721 -42Q2702 -69 2702 -121L2715 -108Q2705 -72 2680 -45Q2654 -17 2614 -3Q2574 12 2518 12ZM2563 -100Q2595 -100 2620 -113Q2645 -126 2659 -151Q2673 -176 2673 -213V-235L2569 -211Q2538 -204 2520 -190Q2503 -175 2503 -151Q2503 -127 2518 -114Q2533 -100 2563 -100Z";
const WORDMARK_W = 2901;

// 學 Pocamarket：半透明的文字標誌斜向平鋪滿整張圖，裁掉一角也去不掉；
// 白字加更淡的黑色描影，淺色和深色背景上都看得到，又不至於擋住卡面
function watermark(w: number, h: number) {
  const markW = w * 0.2;
  const s = markW / WORDMARK_W;
  const stepX = markW * 2.4;
  const stepY = markW * 1.35;
  const d = Math.hypot(w, h);
  const uses: string[] = [];
  for (let row = 0, y = -d / 2; y < d / 2 + stepY; row++, y += stepY) {
    for (let x = -d / 2 + (row % 2) * (stepX / 2); x < d / 2; x += stepX) uses.push(`<use href="#m" x="${x.toFixed(1)}" y="${y.toFixed(1)}"/>`);
  }
  const tiles = uses.join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><g id="m"><g transform="scale(${s})"><path d="${WORDMARK}"/><rect x="42" y="-880" width="210" height="300" rx="50" transform="rotate(14 147 -730)"/></g></g></defs>` +
      `<g transform="translate(${w / 2} ${h / 2}) rotate(-30)">` +
      `<g fill="#000" opacity="0.06" transform="translate(1 1)">${tiles}</g>` +
      `<g fill="#fff" opacity="0.2">${tiles}</g>` +
      `</g></svg>`,
  );
}

// 裁成 55:85：寬圖按 cropX（0 靠左、1 靠右）取水平位置，高圖從頂部取
async function toCard(input: Buffer, cropX = 0.5) {
  const upright = await sharp(input).rotate().toBuffer();
  const { width = 0, height = 0 } = await sharp(upright).metadata();
  const ratio = CARD_W / CARD_H;
  let box = { left: 0, top: 0, width, height };
  if (width / height > ratio) {
    const w = Math.round(height * ratio);
    box = { left: Math.round((width - w) * cropX), top: 0, width: w, height };
  } else {
    box = { left: 0, top: 0, width, height: Math.round(width / ratio) };
  }
  return sharp(upright).extract(box).resize(CARD_W, CARD_H).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
}

async function store(db: Db, id: string, ownerId: string | null, card: Buffer) {
  const display = await sharp(card).composite([{ input: watermark(CARD_W, CARD_H) }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  await db
    .insert(media)
    .values({ id, ownerId, original: card.toString("base64"), display: display.toString("base64") })
    .onConflictDoNothing();
  return display;
}

export const mediaUrl = (id: string) => `/api/media/${id}`;

// 用戶上傳的一組照片（data URL）：全部解碼、驗證是圖片、裁切成功後才加浮水印入庫，回傳展示網址；任何一張不合格就整組拒絕，回傳 null
export async function saveUploads(db: Db, ownerId: string, dataUrls: unknown[]) {
  const cards: Buffer[] = [];
  for (const dataUrl of dataUrls) {
    if (typeof dataUrl !== "string" || dataUrl.length > MAX_UPLOAD) return null;
    const m = /^data:image\/[\w.+-]+;base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    try {
      cards.push(await toCard(Buffer.from(m[1], "base64")));
    } catch {
      return null;
    }
  }
  return Promise.all(
    cards.map(async (card) => {
      const id = randomUUID();
      await store(db, id, ownerId, card);
      return mediaUrl(id);
    }),
  );
}

// 讀展示圖。樣本卡（id 見 src/lib/sample-image.ts）第一次被讀時從維基共享資源抓原圖入庫
export async function readDisplay(db: Db, id: string) {
  const [row] = await db.select({ display: media.display }).from(media).where(eq(media.id, id));
  if (row) return Buffer.from(row.display, "base64");
  const sample = credits.find((c) => sampleId(c.card) === id);
  if (!sample) return null;
  const res = await fetch(sample.src, { headers: { "User-Agent": "Idolca/0.1 (sample photo seeding)" } });
  if (!res.ok) return null;
  return store(db, id, null, await toCard(Buffer.from(await res.arrayBuffer()), sample.cropX));
}
