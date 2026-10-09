// 首頁展示用的假資料。團體和成員都是虛構的，不使用真實偶像的名字和照片。

export type Rarity = "album" | "pob" | "luckydraw" | "fansign";

export type Card = {
  id: string;
  serial: string;
  group: string;
  member: string;
  album: string;
  version: string;
  rarity: Rarity;
  grade?: number;
  priceUsd: number;
  change24h: number;
  palette: [string, string, string];
};

export const RARITY_LABEL: Record<Rarity, string> = {
  album: "專輯卡",
  pob: "預購特典",
  luckydraw: "幸運抽",
  fansign: "簽售限定",
};

export const CARDS: Card[] = [
  {
    id: "c1",
    serial: "PV-000128",
    group: "NOVA//LINE",
    member: "SEOA",
    album: "Starfall",
    version: "Ver. Midnight",
    rarity: "fansign",
    grade: 10,
    priceUsd: 1280,
    change24h: 12.4,
    palette: ["#ff6ad5", "#8c5cff", "#2de2e6"],
  },
  {
    id: "c2",
    serial: "PV-000342",
    group: "AURORA",
    member: "HAEUN",
    album: "Polaris",
    version: "Withmuu POB",
    rarity: "pob",
    grade: 9,
    priceUsd: 214,
    change24h: -3.1,
    palette: ["#ffd36e", "#ff7a59", "#ff3d7f"],
  },
  {
    id: "c3",
    serial: "PV-000517",
    group: "VANTA",
    member: "JIWOO",
    album: "Eclipse",
    version: "Lucky Draw A",
    rarity: "luckydraw",
    priceUsd: 96,
    change24h: 5.8,
    palette: ["#5ef2c2", "#2a9dff", "#6a4cff"],
  },
  {
    id: "c4",
    serial: "PV-000733",
    group: "NOVA//LINE",
    member: "RIN",
    album: "Starfall",
    version: "Ver. Dawn",
    rarity: "album",
    priceUsd: 18,
    change24h: 1.2,
    palette: ["#ffb3e6", "#c9a7ff", "#8fd3ff"],
  },
  {
    id: "c5",
    serial: "PV-000901",
    group: "AURORA",
    member: "YUNA",
    album: "Polaris",
    version: "Ktown POB",
    rarity: "pob",
    grade: 10,
    priceUsd: 342,
    change24h: 8.9,
    palette: ["#a1ffce", "#faffd1", "#7ee8fa"],
  },
  {
    id: "c6",
    serial: "PV-001044",
    group: "VANTA",
    member: "DOHA",
    album: "Eclipse",
    version: "Fansign Event",
    rarity: "fansign",
    priceUsd: 760,
    change24h: -6.4,
    palette: ["#ff9a8b", "#ff6a88", "#ff99ac"],
  },
  {
    id: "c7",
    serial: "PV-001187",
    group: "LUMEN",
    member: "SORA",
    album: "Prism",
    version: "Ver. Glass",
    rarity: "album",
    priceUsd: 24,
    change24h: 0.4,
    palette: ["#c2ffd8", "#465efb", "#9a4dff"],
  },
  {
    id: "c8",
    serial: "PV-001305",
    group: "LUMEN",
    member: "NARI",
    album: "Prism",
    version: "Lucky Draw B",
    rarity: "luckydraw",
    grade: 9,
    priceUsd: 138,
    change24h: 15.2,
    palette: ["#fddb92", "#d1fdff", "#f6a5ff"],
  },
];

export const HERO_CARDS = [CARDS[0], CARDS[4], CARDS[5]];

export type Trade = { card: Card; priceUsd: number; minutesAgo: number };

export const RECENT_TRADES: Trade[] = CARDS.map((card, i) => ({
  card,
  priceUsd: Math.round(card.priceUsd * (0.94 + ((i * 37) % 13) / 100)),
  minutesAgo: (i * 7 + 2) % 59,
}));
