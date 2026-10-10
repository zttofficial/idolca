// 首頁展示用的樣本卡。團體、成員和照片對應 src/lib/sample-credits.json 裡的維基共享資源照片；
// 版本、價格、評級是示意值。devnet 建置前 NFT 地址和持有人是隨機字串，建置後換成鏈上真實地址（見下方 CARDS）。

import { CHAIN } from "./chain";
import { sampleImage } from "./sample-image";

export type Rarity = "album" | "pob" | "luckydraw" | "fansign";

// vaulted：在庫；listed：在託管程序裡掛單；redeeming：已申請提貨，NFT 凍結中
export type VaultStatus = "vaulted" | "listed" | "redeeming";


export type Card = {
  id: string;
  serial: string;
  group: string;
  member: string;
  album: string;
  version: string;
  rarity: Rarity;
  grade?: number;
  priceUsdt: number;
  palette: [string, string, string];
  // NFT 地址和持有人：來自 devnet 建置結果（src/lib/chain/devnet.json），持有人由鏈上即時狀態覆蓋
  asset: string;
  owner: string;
  status: VaultStatus;
  intakeDate: string;
  location: string;
  // 入庫時拍攝的正反面。圖片載入失敗時退回 canvas 佔位圖
  image?: { front: string; back?: string };
};


const SAMPLES: Omit<Card, "asset" | "owner">[] = [
  {
    id: "c1",
    serial: "IC-000128",
    group: "IVE",
    member: "Wonyoung",
    album: "I've IVE",
    version: "Fansign Event",
    rarity: "fansign",
    grade: 10,
    priceUsdt: 1280,
    palette: ["#ff6ad5", "#8c5cff", "#2de2e6"],
    status: "listed",
    intakeDate: "2026-07-14",
    location: "SEL-A03-12",
    image: { front: sampleImage("c1") },
  },
  {
    id: "c2",
    serial: "IC-000342",
    group: "aespa",
    member: "Karina",
    album: "Armageddon",
    version: "Ktown4u POB",
    rarity: "pob",
    grade: 9,
    priceUsdt: 214,
    palette: ["#ffd36e", "#ff7a59", "#ff3d7f"],
    status: "listed",
    intakeDate: "2026-07-21",
    location: "SEL-A03-18",
    image: { front: sampleImage("c2") },
  },
  {
    id: "c3",
    serial: "IC-000517",
    group: "NewJeans",
    member: "Hanni",
    album: "Get Up",
    version: "Lucky Draw Round 1",
    rarity: "luckydraw",
    priceUsdt: 96,
    palette: ["#5ef2c2", "#2a9dff", "#6a4cff"],
    status: "vaulted",
    intakeDate: "2026-08-02",
    location: "SEL-B01-04",
    image: { front: sampleImage("c3") },
  },
  {
    id: "c4",
    serial: "IC-000733",
    group: "LE SSERAFIM",
    member: "Kazuha",
    album: "EASY",
    version: "Compact Ver.",
    rarity: "album",
    priceUsdt: 18,
    palette: ["#ffb3e6", "#c9a7ff", "#8fd3ff"],
    status: "listed",
    intakeDate: "2026-08-02",
    location: "SEL-B01-05",
    image: { front: sampleImage("c4") },
  },
  {
    id: "c5",
    serial: "IC-000901",
    group: "TWICE",
    member: "Nayeon",
    album: "NA",
    version: "Soundwave POB",
    rarity: "pob",
    grade: 10,
    priceUsdt: 342,
    palette: ["#a1ffce", "#faffd1", "#7ee8fa"],
    status: "vaulted",
    intakeDate: "2026-08-19",
    location: "SEL-A07-22",
    image: { front: sampleImage("c5") },
  },
  {
    id: "c6",
    serial: "IC-001044",
    group: "BLACKPINK",
    member: "Jisoo",
    album: "ME",
    version: "Fansign Event",
    rarity: "fansign",
    priceUsdt: 760,
    palette: ["#ff9a8b", "#ff6a88", "#ff99ac"],
    status: "redeeming",
    intakeDate: "2026-09-03",
    location: "SEL-C02-09",
    image: { front: sampleImage("c6") },
  },
  {
    id: "c7",
    serial: "IC-001187",
    group: "Stray Kids",
    member: "Felix",
    album: "ATE",
    version: "Photobook Ver.",
    rarity: "album",
    priceUsdt: 24,
    palette: ["#c2ffd8", "#465efb", "#9a4dff"],
    status: "listed",
    intakeDate: "2026-09-11",
    location: "SEL-B04-31",
    image: { front: sampleImage("c7") },
  },
  {
    id: "c8",
    serial: "IC-001305",
    group: "ITZY",
    member: "Yuna",
    album: "BORN TO BE",
    version: "Lucky Draw Round 2",
    rarity: "luckydraw",
    grade: 9,
    priceUsdt: 138,
    palette: ["#fddb92", "#d1fdff", "#f6a5ff"],
    status: "vaulted",
    intakeDate: "2026-09-26",
    location: "SEL-C05-02",
    image: { front: sampleImage("c8") },
  },
  {
    id: "c9",
    serial: "IC-001422",
    group: "aespa",
    member: "Giselle",
    album: "Armageddon",
    version: "Lucky Draw Round 1",
    rarity: "luckydraw",
    priceUsdt: 72,
    palette: ["#ffd36e", "#ff7a59", "#ff3d7f"],
    status: "listed",
    intakeDate: "2026-09-14",
    location: "SEL-B02-11",
    image: { front: sampleImage("c9") },
  },
  {
    id: "c10",
    serial: "IC-001480",
    group: "aespa",
    member: "Winter",
    album: "Armageddon",
    version: "Fansign Event",
    rarity: "fansign",
    grade: 10,
    priceUsdt: 940,
    palette: ["#ffd36e", "#ff7a59", "#ff3d7f"],
    status: "listed",
    intakeDate: "2026-09-15",
    location: "SEL-A01-03",
    image: { front: sampleImage("c10") },
  },
  {
    id: "c11",
    serial: "IC-001517",
    group: "ITZY",
    member: "Ryujin",
    album: "BORN TO BE",
    version: "Soundwave POB",
    rarity: "pob",
    grade: 9,
    priceUsdt: 46,
    palette: ["#fddb92", "#d1fdff", "#f6a5ff"],
    status: "listed",
    intakeDate: "2026-09-18",
    location: "SEL-C01-07",
    image: { front: sampleImage("c11") },
  },
  {
    id: "c12",
    serial: "IC-001563",
    group: "ITZY",
    member: "Yeji",
    album: "BORN TO BE",
    version: "Album Ver.",
    rarity: "album",
    priceUsdt: 9,
    palette: ["#fddb92", "#d1fdff", "#f6a5ff"],
    status: "vaulted",
    intakeDate: "2026-09-20",
    location: "SEL-C01-12",
    image: { front: sampleImage("c12") },
  },
  {
    id: "c13",
    serial: "IC-001608",
    group: "IVE",
    member: "Yujin",
    album: "I've IVE",
    version: "Ktown4u POB",
    rarity: "pob",
    grade: 10,
    priceUsdt: 188,
    palette: ["#ff6ad5", "#8c5cff", "#2de2e6"],
    status: "listed",
    intakeDate: "2026-09-22",
    location: "SEL-A04-02",
    image: { front: sampleImage("c13") },
  },
  {
    id: "c14",
    serial: "IC-001655",
    group: "LE SSERAFIM",
    member: "Chaewon",
    album: "EASY",
    version: "Lucky Draw Round 2",
    rarity: "luckydraw",
    grade: 9,
    priceUsdt: 126,
    palette: ["#ffb3e6", "#c9a7ff", "#8fd3ff"],
    status: "listed",
    intakeDate: "2026-09-25",
    location: "SEL-B03-19",
    image: { front: sampleImage("c14") },
  },
  {
    id: "c15",
    serial: "IC-001702",
    group: "LE SSERAFIM",
    member: "Sakura",
    album: "EASY",
    version: "Jewel Case Ver.",
    rarity: "album",
    priceUsdt: 14,
    palette: ["#ffb3e6", "#c9a7ff", "#8fd3ff"],
    status: "listed",
    intakeDate: "2026-09-27",
    location: "SEL-B03-22",
    image: { front: sampleImage("c15") },
  },
  {
    id: "c16",
    serial: "IC-001749",
    group: "NewJeans",
    member: "Haerin",
    album: "Get Up",
    version: "Fansign Event",
    rarity: "fansign",
    grade: 10,
    priceUsdt: 1120,
    palette: ["#5ef2c2", "#2a9dff", "#6a4cff"],
    status: "vaulted",
    intakeDate: "2026-09-29",
    location: "SEL-A02-08",
    image: { front: sampleImage("c16") },
  },
  {
    id: "c17",
    serial: "IC-001796",
    group: "NewJeans",
    member: "Minji",
    album: "Get Up",
    version: "Photobook Ver.",
    rarity: "album",
    grade: 9,
    priceUsdt: 22,
    palette: ["#5ef2c2", "#2a9dff", "#6a4cff"],
    status: "listed",
    intakeDate: "2026-10-01",
    location: "SEL-A02-14",
    image: { front: sampleImage("c17") },
  },
  {
    id: "c18",
    serial: "IC-001843",
    group: "Stray Kids",
    member: "Bang Chan",
    album: "ATE",
    version: "Soundwave POB",
    rarity: "pob",
    priceUsdt: 38,
    palette: ["#c2ffd8", "#465efb", "#9a4dff"],
    status: "redeeming",
    intakeDate: "2026-10-03",
    location: "SEL-C04-05",
    image: { front: sampleImage("c18") },
  },
  {
    id: "c19",
    serial: "IC-001890",
    group: "Stray Kids",
    member: "Hyunjin",
    album: "ATE",
    version: "Lucky Draw Round 2",
    rarity: "luckydraw",
    grade: 10,
    priceUsdt: 214,
    palette: ["#c2ffd8", "#465efb", "#9a4dff"],
    status: "listed",
    intakeDate: "2026-10-06",
    location: "SEL-C04-09",
    image: { front: sampleImage("c19") },
  },
];

// devnet 建置後，樣本卡換成鏈上的真實狀態：NFT 地址、持有人（平台錢包，或示範成交的買家），
// 掛單狀態以託管程序裡實際的掛單為準
function onChain(sample: Omit<Card, "asset" | "owner">): Card {
  const c: Card = { ...sample, asset: CHAIN.cards[sample.id] ?? "", owner: CHAIN.platform };
  const asset = CHAIN.cards[c.id];
  if (!asset) return c;
  const trade = CHAIN.market?.demoTrade;
  if (trade?.card === c.id) return { ...c, asset, owner: trade.buyer, status: "vaulted" };
  const listed = Boolean(CHAIN.market?.listings[c.id]);
  return { ...c, asset, owner: CHAIN.platform, status: listed ? "listed" : c.status === "listed" ? "vaulted" : c.status };
}

export const CARDS: Card[] = SAMPLES.map(onChain);

export const HERO_CARDS = [CARDS[0], CARDS[4], CARDS[5]];


export function findCard(id: string) {
  return CARDS.find((c) => c.id === id);
}
