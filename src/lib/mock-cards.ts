// 首頁展示用的樣本卡。團體、成員、專輯對應 public/cards/samples/ 裡的照片；
// 版本、價格、評級是示意值，NFT 地址、持有人和交易哈希是隨機生成的 base58 字串，鏈上不存在。

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
  change24h: number;
  palette: [string, string, string];
  asset: string;
  owner: string;
  status: VaultStatus;
  intakeDate: string;
  location: string;
  // 入庫時拍攝的正反面（public/ 下的路徑）。檔案不存在時退回 canvas 佔位圖；
  // 展示資料指向 public/cards/samples/，那裡的卡樣只在本機，不提交
  image?: { front: string; back?: string };
};


export const CARDS: Card[] = [
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
    change24h: 12.4,
    palette: ["#ff6ad5", "#8c5cff", "#2de2e6"],
    asset: "3pL7ggYEBNqw1F6ujsoW9PLApCs8e7M9ij8hx1A7YSLP",
    owner: "HModdA8ujqKpWxSysLM4CKzx9VieaGe57v9UzV6Kk5QX",
    status: "listed",
    intakeDate: "2026-07-14",
    location: "SEL-A03-12",
    image: { front: "/cards/samples/c1.jpg" },
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
    change24h: -3.1,
    palette: ["#ffd36e", "#ff7a59", "#ff3d7f"],
    asset: "Fpp7k9Laj6TmyrcADY7x6XpGwoXXtwLYpD42bYy1ZcxY",
    owner: "GJ3mB7kXgNc6LTXEofg3ZK4EfTxDgj2ofDwBCFZhUTpL",
    status: "listed",
    intakeDate: "2026-07-21",
    location: "SEL-A03-18",
    image: { front: "/cards/samples/c2.jpg" },
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
    change24h: 5.8,
    palette: ["#5ef2c2", "#2a9dff", "#6a4cff"],
    asset: "7Zb5xaYFj9FjjnvdEwzyxcfpteenwRT1zVAEvgMSjMog",
    owner: "AfBrf58D7BzVtny58DMK3Jc78ct6xUcEtBWeAxunrye",
    status: "vaulted",
    intakeDate: "2026-08-02",
    location: "SEL-B01-04",
    image: { front: "/cards/samples/c3.jpg" },
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
    change24h: 1.2,
    palette: ["#ffb3e6", "#c9a7ff", "#8fd3ff"],
    asset: "4xaLrfvbmreMKC5kt7gZiRUzwhZB5ojcbD5K9y198jxL",
    owner: "565McieGmJ61JunKa1wQqwzUqgidb1fkKyMcKrSDiwwH",
    status: "listed",
    intakeDate: "2026-08-02",
    location: "SEL-B01-05",
    image: { front: "/cards/samples/c4.jpg" },
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
    change24h: 8.9,
    palette: ["#a1ffce", "#faffd1", "#7ee8fa"],
    asset: "9SLxgf6FFEk6Nd1U4FGXTGZuQBxSeaCiCkxEp2oPtECs",
    owner: "7EobgkjCG8GdqoQbvKQZqx9ow1736eHS6HLBUVzHW8UG",
    status: "vaulted",
    intakeDate: "2026-08-19",
    location: "SEL-A07-22",
    image: { front: "/cards/samples/c5.jpg" },
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
    change24h: -6.4,
    palette: ["#ff9a8b", "#ff6a88", "#ff99ac"],
    asset: "Gc34gdjPkAAPowP7wHLuWEZQL8gZdsvMxsrk1VdLCh5f",
    owner: "HModdA8ujqKpWxSysLM4CKzx9VieaGe57v9UzV6Kk5QX",
    status: "redeeming",
    intakeDate: "2026-09-03",
    location: "SEL-C02-09",
    image: { front: "/cards/samples/c6.jpg" },
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
    change24h: 0.4,
    palette: ["#c2ffd8", "#465efb", "#9a4dff"],
    asset: "EHgNUqCBoxxUc3ScTXff78yHAZGyFWDjPQHB1TFPwQCM",
    owner: "2r24k55rVnHnoNKTQpLsDwtrP6MnKU5SoiP1966VzQyL",
    status: "listed",
    intakeDate: "2026-09-11",
    location: "SEL-B04-31",
    image: { front: "/cards/samples/c7.jpg" },
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
    change24h: 15.2,
    palette: ["#fddb92", "#d1fdff", "#f6a5ff"],
    asset: "FQFEt1erUhSpv36FX5a8CjYodXbRs5uYSz4nk3UesPaA",
    owner: "Dd7fchn9bsZYcKhHmGpWgNQ2gunN2x8JUhdftSWBk5R8",
    status: "vaulted",
    intakeDate: "2026-09-26",
    location: "SEL-C05-02",
    image: { front: "/cards/samples/c8.jpg" },
  },
];

export const HERO_CARDS = [CARDS[0], CARDS[4], CARDS[5]];

export type Trade = { card: Card; priceUsdt: number; minutesAgo: number; signature: string };

const SIGNATURES = [
  "5UBvrioqdaAKVLna3EXxeGu1K5MbSZdqS1UcN2bJk7NvqWLRtrF6ebHDfz91QvMAtXa6LWxJa51DdzaqHXWXRLig",
  "4VwdnKiMf2qBcJuav7o7QzzW7YyWYgoGKKA41EB7gYEFiJPM1WgUiHAYozZiLviY9cyYCmKpWgjafjnnDQ94pMD6",
  "2waHkKqm1zXnDDsbapSv4P1Qk7fgwrx29amb2Rikw1CgQvtyVmFsEMC3ScTUoZAhoGMjg2NeBGk3Fa2UhCHKxZLb",
  "4WV1ArN7sEijQu13ZT9LEvtfF4rf9MFPNHcRDVfrfcb3rV21jG3RP3vBaELfeyGWCFRFvqqCv1vr2DstpG3XAYHU",
  "Na4eSNexBPn8Nno51S6qHkMgnCxmqMZTVHFJuhhrcMwxRQWxTnKbA31DJP4qCWdGiup6exGTQULeW7GSdXSiXaA",
  "397LFkRJMEWeYhUS3tncvHpHL2yepp4BeXTL9tEDfNvArjGabsBsVVjyoXeq3PPyq7oMGJNZqdReVA9J1ndhbXvc",
  "DQfyYjyCezujoVkR5oTtdAJMjqUvNkrUu3JrgJk3F99rVTKvx6xAT3C5cup4rWEgEpDqD3J9UA3eD3cEzZb1cf1",
  "Ekasp52y7j4c7DPR8G46du7bVh9c3FMw5DeJeqhn3higeXpccugo9m4v5x2WNKMdG9NQz6NkcH1jGdnho9TbHcC",
];

export const RECENT_TRADES: Trade[] = CARDS.map((card, i) => ({
  card,
  priceUsdt: Math.round(card.priceUsdt * (0.94 + ((i * 37) % 13) / 100)),
  minutesAgo: (i * 7 + 2) % 59,
  signature: SIGNATURES[i],
}));

export const LAST_AUDIT_DATE = "2026-10-01";

// 首頁統計區的展示數字（接入索引資料庫前）
export const VAULT_STATS = {
  totalValueUsdt: 3_184_920,
  holders: 21_406,
  volume24hUsdt: 84_210,
};

export function findCard(id: string) {
  return CARDS.find((c) => c.id === id);
}
