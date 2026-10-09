// 用 canvas 程序化生成小卡正反面的佔位圖。3D 卡（貼圖）和列表卡（<canvas>）共用。

import { RARITY_LABEL, type Card } from "./mock-cards";

// 小卡實物尺寸 55 × 85 mm
export const CARD_ASPECT = 55 / 85;
export const ART_W = 550;
export const ART_H = 850;

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const FONT = '"Geist", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export function drawCardFront(ctx: CanvasRenderingContext2D, card: Card) {
  const w = ART_W;
  const h = ART_H;
  const rand = seeded(card.id);
  const [c1, c2, c3] = card.palette;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, c1);
  bg.addColorStop(0.55, c2);
  bg.addColorStop(1, c3);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 散景光斑
  for (let i = 0; i < 26; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.75;
    const r = 12 + rand() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.12 + rand() * 0.3})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 人像剪影：頭、頸、肩
  const cx = w / 2 + (rand() - 0.5) * 40;
  const glow = ctx.createRadialGradient(cx, h * 0.42, 40, cx, h * 0.42, 340);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(20, 12, 40, 0.78)";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.36, 92, 112, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 42, h * 0.46);
  ctx.lineTo(cx + 42, h * 0.46);
  ctx.lineTo(cx + 48, h * 0.53);
  ctx.bezierCurveTo(cx + 230, h * 0.56, cx + 250, h * 0.72, cx + 260, h);
  ctx.lineTo(cx - 260, h);
  ctx.bezierCurveTo(cx - 250, h * 0.72, cx - 230, h * 0.56, cx - 48, h * 0.53);
  ctx.closePath();
  ctx.fill();

  // 底部漸暗，襯托文字
  const shade = ctx.createLinearGradient(0, h * 0.62, 0, h);
  shade.addColorStop(0, "rgba(10,6,24,0)");
  shade.addColorStop(1, "rgba(10,6,24,0.85)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);

  // 頂部標籤
  ctx.font = `600 22px ${FONT}`;
  const tag = RARITY_LABEL[card.rarity];
  const tagW = ctx.measureText(tag).width + 28;
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(ctx, 28, 28, tagW, 40, 20);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(tag, 42, 49);

  if (card.grade) {
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(`GRADE ${card.grade}`, w - 32, 49);
    ctx.textAlign = "left";
  }

  // 底部文字
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.font = `800 76px ${FONT}`;
  ctx.fillText(card.member, 32, h - 104);
  ctx.font = `500 26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(`${card.group} · ${card.album}`, 34, h - 62);
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(card.version, 34, h - 32);
}

export function drawCardBack(ctx: CanvasRenderingContext2D, card: Card) {
  const w = ART_W;
  const h = ART_H;

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#120b2e");
  bg.addColorStop(1, "#05030f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 斜向重複的字紋
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `700 26px ${FONT}`;
  ctx.fillStyle = "rgba(160,130,255,0.08)";
  for (let y = -h; y < h; y += 52) {
    for (let x = -w * 1.2; x < w * 1.2; x += 230) {
      ctx.fillText("POCAVAULT", x + ((y / 52) % 2) * 115, y);
    }
  }
  ctx.restore();

  // 中央標誌
  const ring = ctx.createLinearGradient(w / 2 - 110, 0, w / 2 + 110, 0);
  ring.addColorStop(0, card.palette[0]);
  ring.addColorStop(1, card.palette[2]);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, 110, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.42, 92, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText("PV", w / 2, h * 0.42 + 22);

  ctx.font = `700 30px ${FONT}`;
  ctx.fillText("POCAVAULT", w / 2, h * 0.62);
  ctx.font = `500 20px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.fillText("VAULTED · VERIFIED · REDEEMABLE", w / 2, h * 0.66);

  ctx.font = `600 22px "Geist Mono", ui-monospace, monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(card.serial, w / 2, h - 60);
  ctx.textAlign = "left";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function renderToCanvas(draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = ART_W;
  canvas.height = ART_H;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  return canvas;
}
