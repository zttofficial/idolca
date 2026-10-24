import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 分享圖（next/og 的 ImageResponse）共用的字標、配色和字型。字體、字重、配色照網站：Geist（src/assets/fonts，800 那檔在官方包裡叫 UltraBlack），字標比例照 Wordmark 組件
export const INK = "#111114";
export const INK_2 = "#555560";
export const ACCENT = "#e8285a";

const FONTS = join(process.cwd(), "src/assets/fonts");
let geist: Promise<[Buffer, Buffer]> | undefined;
const loadGeist = () => (geist ??= Promise.all([readFile(join(FONTS, "Geist-Regular.ttf")), readFile(join(FONTS, "Geist-ExtraBold.ttf"))]));

type Font = { name: string; data: ArrayBuffer | Buffer; weight: 400 | 800; style: "normal" };

export async function geistFonts(): Promise<Font[]> {
  const [regular, extraBold] = await loadGeist();
  return [
    { name: "Geist", data: regular, weight: 400, style: "normal" },
    { name: "Geist", data: extraBold, weight: 800, style: "normal" },
  ];
}

// Geist 只有拉丁字母。暱稱和譯文裡的韓文、中日文、泰文等，按文字從 Google Fonts 取只含這些字的子集，排在 Geist 後面當備用字型
const SCRIPTS: { test: RegExp; family: string }[] = [
  { test: /[ᄀ-ᇿ㄰-㆏가-힯]/, family: "Noto Sans KR" },
  { test: /[぀-ヿ]/, family: "Noto Sans JP" },
  { test: /[㐀-鿿豈-﫿]/, family: "Noto Sans TC" },
  { test: /[฀-๿]/, family: "Noto Sans Thai" },
  // 越南文的聲調字母等 Geist 沒有的拉丁擴充字母
  { test: /[Ā-ɏḀ-ỿ]/, family: "Noto Sans" },
];

async function googleFont(family: string, weight: 400 | 800, text: string) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
  const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
  if (!url) throw new Error(`no font for ${family}`);
  return (await fetch(url)).arrayBuffer();
}

// 取不到字型時不中斷：那幾個字會畫成空框，圖照樣生成
export async function fontsFor(text: string): Promise<Font[]> {
  const extra = [...new Set(text)].filter((c) => c.charCodeAt(0) > 0x7e).join("");
  const families = extra ? SCRIPTS.filter((s) => s.test.test(extra)).map((s) => s.family) : [];
  const loaded = await Promise.all(
    families.flatMap((family) =>
      ([400, 800] as const).map((weight) =>
        googleFont(family, weight, extra)
          .then((data): Font => ({ name: family, data, weight, style: "normal" }))
          .catch(() => null),
      ),
    ),
  );
  return [...(await geistFonts()), ...loaded.filter((f): f is Font => f !== null)];
}

// Geist ExtraBold 裡 ASCII 空格到 ~ 每個字的寬度（千分之一 em），從字型檔量出來的；換字型要重量
const ASCII_WIDTHS = [
  221, 272, 405, 626, 683, 833, 734, 212, 339, 339, 419, 574, 248, 417, 248, 536, 703, 470, 665, 662, 670, 686, 638, 551, 684, 643, 315, 315, 552, 556, 552, 602, 981, 750, 710, 745, 723,
  628, 609, 751, 724, 310, 637, 705, 592, 927, 753, 788, 679, 781, 706, 695, 615, 708, 751, 1038, 715, 650, 610, 404, 516, 404, 473, 563, 288, 609, 647, 615, 647, 620, 464, 647, 621, 294,
  355, 666, 328, 907, 621, 633, 647, 647, 440, 586, 462, 618, 633, 859, 671, 603, 598, 414, 304, 414, 523,
];

// 一段文字在 1px 字號下的寬度（ExtraBold）：分享圖沒有瀏覽器排版可問，按字寬算來挑字號。
// 韓文、中日文是全形；其他非 ASCII 字（重音字母、泰文等）按偏寬的 0.75em 算，寧可小一點也不被裁掉
function textEm(text: string) {
  let em = 0;
  for (const c of text) {
    const code = c.charCodeAt(0);
    if (code >= 32 && code <= 126) em += ASCII_WIDTHS[code - 32] / 1000;
    else if (/[ᄀ-ᇿ㄰-㆏가-힯぀-ヿ㐀-鿿豈-﫿]/.test(c)) em += 1;
    else em += 0.75;
  }
  return em;
}

// 在 max 和 min 之間挑能讓文字在 lines 行內放進 width 的最大字號；單字放不下時照樣用 min，再交給 textOverflow 收尾
export function fitFontSize(text: string, width: number, { max, min, lines = 1 }: { max: number; min: number; lines?: number }) {
  const em = textEm(text);
  // 多行時每行會因斷詞留下空白，按 85% 的行寬算
  const room = lines === 1 ? width : width * lines * 0.85;
  return Math.max(min, Math.min(max, Math.floor(room / em)));
}

// 字標：無點的 ı 上面一塊斜放的品牌色方塊，接著 dolca
export function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", fontSize: size, fontWeight: 800, lineHeight: 1, letterSpacing: -0.045 * size }}>
      <span style={{ position: "relative", display: "flex" }}>
        ı
        <span
          style={{
            position: "absolute",
            top: -0.2 * size,
            left: "50%",
            marginLeft: -0.105 * size,
            width: 0.21 * size,
            height: 0.3 * size,
            borderRadius: 0.05 * size,
            background: ACCENT,
            transform: "rotate(14deg)",
          }}
        />
      </span>
      <span>dolca</span>
    </div>
  );
}
