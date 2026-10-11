// 小卡圖鑑：團體 → 專輯 → 成員 × 版本，每個組合是一個「卡款」（不是某一張實物）。
// 團體、成員、專輯是真實資料；版本清單是示意的通用版本，正式版從官方資料和用戶投稿建立。

import type { Card, Rarity } from "./cards";

export type Version = { label: string; rarity: Rarity };

// 通用版本：涵蓋樣本卡用到的所有版本
const VERSIONS: Version[] = [
  { label: "Album Ver.", rarity: "album" },
  { label: "Jewel Case Ver.", rarity: "album" },
  { label: "Compact Ver.", rarity: "album" },
  { label: "Photobook Ver.", rarity: "album" },
  { label: "Ktown4u POB", rarity: "pob" },
  { label: "Soundwave POB", rarity: "pob" },
  { label: "Lucky Draw Round 1", rarity: "luckydraw" },
  { label: "Lucky Draw Round 2", rarity: "luckydraw" },
  { label: "Fansign Event", rarity: "fansign" },
];

export type Album = { id: string; title: string; year: number; members: string[] };
export type Group = { id: string; name: string; members: string[]; albums: Album[]; palette: [string, string, string] };

const group = (id: string, name: string, members: string[], palette: Group["palette"], album: Omit<Album, "members"> & { members?: string[] }): Group => ({
  id,
  name,
  members,
  palette,
  albums: [{ ...album, members: album.members ?? members }],
});

export const GROUPS: Group[] = [
  group("ive", "IVE", ["Yujin", "Gaeul", "Rei", "Wonyoung", "Liz", "Leeseo"], ["#ff6ad5", "#8c5cff", "#2de2e6"], { id: "ive-ive", title: "I've IVE", year: 2023 }),
  group("aespa", "aespa", ["Karina", "Giselle", "Winter", "Ningning"], ["#ffd36e", "#ff7a59", "#ff3d7f"], { id: "armageddon", title: "Armageddon", year: 2024 }),
  group("newjeans", "NewJeans", ["Minji", "Hanni", "Danielle", "Haerin", "Hyein"], ["#5ef2c2", "#2a9dff", "#6a4cff"], { id: "get-up", title: "Get Up", year: 2023 }),
  group("lesserafim", "LE SSERAFIM", ["Chaewon", "Sakura", "Yunjin", "Kazuha", "Eunchae"], ["#ffb3e6", "#c9a7ff", "#8fd3ff"], { id: "easy", title: "EASY", year: 2024 }),
  // 娜璉、Jisoo 的樣本專輯是個人專輯，卡款只有本人
  group("twice", "TWICE", ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"], ["#a1ffce", "#faffd1", "#7ee8fa"], { id: "na", title: "NA", year: 2024, members: ["Nayeon"] }),
  group("blackpink", "BLACKPINK", ["Jisoo", "Jennie", "Rosé", "Lisa"], ["#ff9a8b", "#ff6a88", "#ff99ac"], { id: "me", title: "ME", year: 2023, members: ["Jisoo"] }),
  group("straykids", "Stray Kids", ["Bang Chan", "Lee Know", "Changbin", "Hyunjin", "Han", "Felix", "Seungmin", "I.N"], ["#c2ffd8", "#465efb", "#9a4dff"], { id: "ate", title: "ATE", year: 2024 }),
  group("itzy", "ITZY", ["Yeji", "Lia", "Ryujin", "Chaeryeong", "Yuna"], ["#fddb92", "#d1fdff", "#f6a5ff"], { id: "born-to-be", title: "BORN TO BE", year: 2024 }),
];

export type Template = {
  id: string;
  groupId: string;
  group: string;
  member: string;
  albumId: string;
  album: string;
  version: string;
  rarity: Rarity;
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function buildTemplates(): Template[] {
  const out: Template[] = [];
  for (const g of GROUPS) {
    for (const a of g.albums) {
      for (const member of a.members) {
        for (const v of VERSIONS) {
          const id = `${g.id}--${slug(member)}--${a.id}--${slug(v.label)}`;
          out.push({
            id,
            groupId: g.id,
            group: g.name,
            member,
            albumId: a.id,
            album: a.title,
            version: v.label,
            rarity: v.rarity,
          });
        }
      }
    }
  }
  return out;
}

export const TEMPLATES = buildTemplates();
const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export const findTemplate = (id: string) => BY_ID.get(id);
export const findGroup = (id: string) => GROUPS.find((g) => g.id === id);
export const templatesOf = (groupId: string) => TEMPLATES.filter((t) => t.groupId === groupId);

// 還沒有掃描圖的卡款用中性灰的佔位卡面，一眼看得出「缺圖」，也不和照片搶顏色
const PLACEHOLDER: Card["palette"] = ["#ececf1", "#dedee6", "#cfcfd9"];

// 一張金庫卡是不是這個卡款（團體、成員、專輯、版本都對得上，不分大小寫）
const norm = (s: string) => s.trim().toLowerCase();
export const isTemplateOf = (c: Pick<Card, "group" | "member" | "album" | "version">, t: Template) =>
  norm(c.group) === norm(t.group) && norm(c.member) === norm(t.member) && norm(c.album) === norm(t.album) && norm(c.version) === norm(t.version);

// 卡款渲染成卡片：金庫裡有這個卡款就用那張卡（帶實拍照片），否則畫佔位卡面
export function templateCard(t: Template, vault?: Card[] | null): Card {
  const match = vault?.find((c) => c.image && isTemplateOf(c, t)) ?? vault?.find((c) => isTemplateOf(c, t));
  if (match) return match;
  return {
    id: t.id,
    serial: "",
    group: t.group,
    member: t.member,
    album: t.album,
    version: t.version,
    rarity: t.rarity,
    priceUsdt: 0,
    palette: PLACEHOLDER,
    asset: "",
    owner: "",
    status: "vaulted",
    intakeDate: "",
    location: "",
  };
}
