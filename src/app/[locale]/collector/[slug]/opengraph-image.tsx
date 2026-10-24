import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { createTranslator, hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { findGroup, findTemplate, templateCard, type Template } from "@/lib/catalog";
import { getDb } from "@/lib/server/db";
import { readDisplay } from "@/lib/server/media";
import { getPublicBinder } from "@/lib/server/public-binder";
import { ACCENT, fitFontSize, fontsFor, INK, INK_2, Wordmark } from "@/lib/server/share-image";
import { listVaultCards } from "@/lib/server/vault-cards";

// 公開收藏冊的分享圖：暱稱、有幾張、想要幾張，右邊攤開三張卡。卡面和頁面上一樣：金庫裡有這個卡款就用實拍照，否則畫團體配色的簡化卡面
export const alt = "Idolca photocard binder";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// 手機上分享圖約顯示成 360px 寬，等於縮到三成：字號都按縮小後還讀得清來定
const LEFT_W = 640;
const TITLE_W = LEFT_W - 72 - 24;
const CARD_W = 164;
const CARD_H = Math.round((CARD_W * 85) / 55);
// 相鄰兩張卡的中心距：比卡寬多留的空隙要大過卡斜放後角落外擴的距離（約 13px），卡才不會互相遮住。
// 中間那張卡的中心略偏左，右邊那張斜放後離圖片右緣還留著邊
const CARD_STEP = 178;
const CARDS_X = 900;
const MAX_CARDS = 3;
const BORDER = 6;
const LABEL_PAD = 14;
const LABEL_W = CARD_W - BORDER * 2 - LABEL_PAD * 2;
const NEUTRAL = ["#ececf1", "#dedee6", "#cfcfd9"];

// 金庫卡的照片（/api/media/{id}）直接從資料庫讀出來嵌進圖裡，不繞一圈 HTTP
async function photoOf(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, src: string | undefined) {
  const id = src && /^\/api\/media\/([\w-]+)$/.exec(src)?.[1];
  if (!id) return null;
  const jpeg = await readDisplay(db, id).catch(() => null);
  return jpeg ? `data:image/jpeg;base64,${jpeg.toString("base64")}` : null;
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  await connection();
  const { locale: raw, slug } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const db = await getDb();
  const binder = db ? await getPublicBinder(db, slug) : null;
  // 分享圖是路由處理器，讀不到 next-intl 的請求設定（要用 next/root-params），不能用 getTranslations；直接讀那個語言的文案
  const messages = (await import(`../../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "PublicBinder" });
  const title = binder ? t("title", { name: binder.name }) : "Idolca";
  const stats = binder
    ? [
        { label: t("statHave"), value: binder.have.length },
        { label: t("statWant"), value: binder.want.length },
      ]
    : [];

  // 有實拍照的卡排前面；先放有的卡，不夠再放想要的
  const vault = db && binder ? await listVaultCards(db) : [];
  const candidates = binder ? [...binder.have.map((h) => h.id), ...binder.want].map((id) => findTemplate(id)).filter((x): x is Template => Boolean(x)) : [];
  const withCard = candidates.map((template) => ({ template, card: templateCard(template, vault) }));
  const picked = [...withCard.filter((x) => x.card.image), ...withCard.filter((x) => !x.card.image)].slice(0, MAX_CARDS);
  const cards = await Promise.all(picked.map(async ({ template, card }) => ({ template, photo: db ? await photoOf(db, card.image?.front) : null })));

  const text = [title, ...stats.map((s) => s.label), ...cards.map((c) => `${c.template.group}${c.template.member}`)].join("");
  // 標題最多兩行，暱稱越長字越小；有放不下一行的長單詞（沒有空格的長暱稱）才允許在詞中間換行，否則韓文、英文都按詞換行
  const titleSize = fitFontSize(title, TITLE_W, { max: 76, min: 44, lines: 2 });
  const longWord = title.split(/\s+/).some((w) => fitFontSize(w, TITLE_W, { max: titleSize, min: 1 }) < titleSize);
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#ffffff", fontFamily: "Geist", color: INK }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: LEFT_W, padding: "64px 0 64px 72px" }}>
        <Wordmark size={56} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              width: TITLE_W,
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -0.025 * titleSize,
              display: "block",
              lineClamp: 2,
              wordBreak: longWord ? "break-word" : "keep-all",
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", marginTop: 36, gap: 56 }}>
            {/* 數字要轉成字串：ImageResponse 把數字子節點當成多個節點，沒有 display: flex 會報錯 */}
            {stats.map((s, i) => (
              <div key={s.label} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 100, fontWeight: 800, lineHeight: 1, color: i === 0 ? ACCENT : INK }}>{String(s.value)}</div>
                <div style={{ marginTop: 8, fontSize: 36, color: INK_2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 30, color: INK_2 }}>idolca.trade</div>
      </div>
      <div style={{ position: "relative", display: "flex", flex: 1 }}>
        {cards.map((c, i) => (
          <CardFace key={c.template.id} template={c.template} photo={c.photo} offset={i - (cards.length - 1) / 2} />
        ))}
      </div>
    </div>,
    { ...size, fonts: await fontsFor(text) },
  );
}

// 攤開的一張卡：兩邊的稍低、稍斜。卡和卡之間留空，不互相遮住，卡上的名字整個露出來
function CardFace({ template, photo, offset }: { template: Template; photo: string | null; offset: number }) {
  const [c1, c2, c3] = findGroup(template.groupId)?.palette ?? NEUTRAL;
  const nameSize = fitFontSize(template.member, LABEL_W, { max: 28, min: 16 });
  // 單行放不下時以省略號收尾，不讓字超出卡面
  const oneLine = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: LABEL_W } as const;
  return (
    <div
      style={{
        position: "absolute",
        top: 315 - CARD_H / 2 + Math.abs(offset) * 26,
        left: CARDS_X - LEFT_W - CARD_W / 2 + offset * CARD_STEP,
        width: CARD_W,
        height: CARD_H,
        display: "flex",
        borderRadius: 16,
        overflow: "hidden",
        border: `${BORDER}px solid #ffffff`,
        boxShadow: "0 18px 40px rgba(20, 10, 30, 0.28)",
        transform: `rotate(${offset * 6}deg)`,
        background: `linear-gradient(160deg, ${c1}, ${c2} 55%, ${c3})`,
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- ImageResponse 裡只能用 img
        <img src={photo} alt="" width={CARD_W - BORDER * 2} height={CARD_H - BORDER * 2} style={{ objectFit: "cover" }} />
      ) : (
        // 還沒有實拍照的卡款：團體配色加成員名，底部壓一層暗色讓白字看得清
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: "100%",
            padding: LABEL_PAD,
            color: "#ffffff",
            backgroundImage: "linear-gradient(180deg, rgba(17, 17, 20, 0) 40%, rgba(17, 17, 20, 0.6))",
          }}
        >
          <div style={{ ...oneLine, fontSize: 17, fontWeight: 400, opacity: 0.9 }}>{template.group}</div>
          <div style={{ ...oneLine, fontSize: nameSize, fontWeight: 800, lineHeight: 1.15 }}>{template.member}</div>
        </div>
      )}
    </div>
  );
}
