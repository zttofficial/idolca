// 沒有實拍圖的卡，用 canvas 程序化生成正反面佔位圖。3D 卡（貼圖）和列表卡（<canvas>）共用。

import type { Card } from "./cards";
import { seeded } from "./seeded";

// 小卡實物尺寸 55 × 85 mm
export const CARD_ASPECT = 55 / 85;
export const ART_W = 550;
export const ART_H = 850;

const FONT = '"Geist", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';

export function drawCardFront(ctx: CanvasRenderingContext2D, card: Card, rarityLabel: string) {
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
  const tag = rarityLabel;
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

// 平台統一卡背：近黑底、淡字紋、中央是文字標誌（i 的點是一張主色小卡）
export function drawCardBack(ctx: CanvasRenderingContext2D, card: Card) {
  const w = ART_W;
  const h = ART_H;

  ctx.fillStyle = "#111114";
  ctx.fillRect(0, 0, w, h);

  // 斜向重複的字紋
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `800 26px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  for (let y = -h; y < h; y += 52) {
    for (let x = -w * 1.2; x < w * 1.2; x += 200) {
      ctx.fillText("idolca", x + ((y / 52) % 2) * 100, y);
    }
  }
  ctx.restore();

  // 文字標誌：「ıdolca」加一張斜放的主色小卡當 i 的點
  ctx.fillStyle = "#fff";
  ctx.font = `800 88px ${FONT}`;
  ctx.textBaseline = "alphabetic";
  const word = "ıdolca";
  const width = ctx.measureText(word).width;
  const x0 = (w - width) / 2;
  const y0 = h * 0.5;
  ctx.fillText(word, x0, y0);
  const iWidth = ctx.measureText("ı").width;
  ctx.save();
  ctx.translate(x0 + iWidth / 2, y0 - 82);
  ctx.rotate((14 * Math.PI) / 180);
  ctx.fillStyle = "#e8285a";
  roundRect(ctx, -9, -13, 18, 26, 4);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = `600 18px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("VAULTED · VERIFIED · REDEEMABLE", w / 2, h * 0.58);

  if (card.serial) {
    ctx.font = `600 22px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(card.serial, w / 2, h - 60);
  }
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
