import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { DEFAULT_SHARE_IMAGE } from "@/lib/seo";

// 預設分享圖：品牌字標和一句賣點，各語言共用。卡片頁另外用卡片照片。
// 字體、字重、配色照網站：Geist（src/assets/fonts，800 那檔在官方包裡叫 UltraBlack），字標比例照 Wordmark 組件
export const alt = DEFAULT_SHARE_IMAGE.alt;
export const size = { width: DEFAULT_SHARE_IMAGE.width, height: DEFAULT_SHARE_IMAGE.height };
export const contentType = "image/png";

const INK = "#111114";
const INK_2 = "#555560";
const ACCENT = "#e8285a";
const LOGO = 132;

// 在模組頂層讀字型，分享圖才會在構建時生成成靜態檔
const FONTS = join(process.cwd(), "src/assets/fonts");
const [regular, extraBold] = await Promise.all([readFile(join(FONTS, "Geist-Regular.ttf")), readFile(join(FONTS, "Geist-ExtraBold.ttf"))]);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#ffffff", fontFamily: "Geist", color: INK }}>
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: LOGO, fontWeight: 800, lineHeight: 1, letterSpacing: -0.045 * LOGO }}>
          <span style={{ position: "relative", display: "flex" }}>
            ı
            <span
              style={{
                position: "absolute",
                top: -0.2 * LOGO,
                left: "50%",
                marginLeft: -0.105 * LOGO,
                width: 0.21 * LOGO,
                height: 0.3 * LOGO,
                borderRadius: 0.05 * LOGO,
                background: ACCENT,
                transform: "rotate(14deg)",
              }}
            />
          </span>
          <span>dolca</span>
        </div>
        <div style={{ marginTop: 48, fontSize: 60, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.025 * 60 }}>Every photocard finds its fan</div>
        <div style={{ marginTop: 20, fontSize: 32, fontWeight: 400, color: INK_2 }}>Authentic K-pop photocards, traded with fans worldwide</div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: extraBold, weight: 800, style: "normal" },
      ],
    },
  );
}
