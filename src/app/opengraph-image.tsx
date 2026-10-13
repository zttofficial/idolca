import { ImageResponse } from "next/og";
import { DEFAULT_SHARE_IMAGE } from "@/lib/seo";

// 預設分享圖：品牌字標和一句賣點，各語言共用。卡片頁另外用卡片照片
export const alt = DEFAULT_SHARE_IMAGE.alt;
export const size = { width: DEFAULT_SHARE_IMAGE.width, height: DEFAULT_SHARE_IMAGE.height };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "flex-end", fontSize: 120, fontWeight: 800, letterSpacing: -4, color: "#111114" }}>
          <span style={{ position: "relative", display: "flex" }}>
            <span style={{ position: "absolute", top: 4, left: 10, width: 22, height: 30, background: "#e8285a", borderRadius: 4, transform: "rotate(-14deg)" }} />
            ı
          </span>
          dolca
        </div>
        <div style={{ marginTop: 36, fontSize: 56, fontWeight: 700, color: "#111114", lineHeight: 1.15 }}>Every photocard finds its fan</div>
        <div style={{ marginTop: 20, fontSize: 32, color: "#5b5b66" }}>Authentic K-pop photocards, traded with fans worldwide</div>
      </div>
    ),
    size,
  );
}
