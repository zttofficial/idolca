// K-pop 團體名錄：上鏈和入庫表單裡「團體」「成員」的候選項。只是建議，表單仍可自由填寫。
// 團體名稱用官方寫法；成員用藝名，包含已離隊的成員（他們的小卡仍在流通）。
// 收錄哪些團體參考 Wikidata（CC0）裡曲風為 K-pop 的團體和各語言維基條目數；成員只收得到可靠資料的團體，其餘留空由用戶自填。
// 圖鑑裡的團體（catalog.ts 的 GROUPS）會和這份名錄合併，合併後的清單是 GROUP_DIRECTORY。

import { GROUPS } from "./catalog";

export type DirectoryGroup = { name: string; members?: string[]; aka?: string[] };

export const KPOP_GROUPS: DirectoryGroup[] = [
  // 女團
  { name: "aespa", members: ["Karina", "Giselle", "Winter", "Ningning"] },
  { name: "After School" },
  { name: "AOA" },
  { name: "Apink", members: ["Chorong", "Bomi", "Eunji", "Naeun", "Namjoo", "Hayoung"] },
  { name: "ARTMS", members: ["Heejin", "Haseul", "Kim Lip", "Jinsoul", "Choerry"] },
  { name: "BABYMONSTER", members: ["Ruka", "Pharita", "Asa", "Ahyeon", "Rami", "Rora", "Chiquita"] },
  { name: "Billlie" },
  { name: "BLACKPINK", members: ["Jisoo", "Jennie", "Rosé", "Lisa"] },
  { name: "Brown Eyed Girls" },
  { name: "Cherry Bullet" },
  { name: "CLASS:y" },
  { name: "CLC" },
  { name: "Dreamcatcher", members: ["JiU", "SuA", "Siyeon", "Handong", "Yoohyeon", "Dami", "Gahyeon"] },
  { name: "EXID", members: ["Solji", "LE", "Hani", "Hyerin", "Jeonghwa"] },
  { name: "EVERGLOW", members: ["E:U", "Sihyeon", "Mia", "Onda", "Aisha", "Yiren"] },
  { name: "f(x)", members: ["Victoria", "Amber", "Luna", "Sulli", "Krystal"] },
  { name: "FIFTY FIFTY" },
  { name: "fromis_9", members: ["Saerom", "Hayoung", "Gyuri", "Jiwon", "Jisun", "Seoyeon", "Chaeyoung", "Nagyung", "Jiheon"] },
  { name: "GFRIEND", members: ["Sowon", "Yerin", "Eunha", "Yuju", "SinB", "Umji"] },
  { name: "Girls' Generation", members: ["Taeyeon", "Sunny", "Tiffany", "Hyoyeon", "Yuri", "Sooyoung", "Yoona", "Seohyun", "Jessica"], aka: ["SNSD"] },
  { name: "Girl's Day", members: ["Sojin", "Yura", "Minah", "Hyeri"] },
  { name: "H1-KEY" },
  { name: "Hearts2Hearts" },
  { name: "i-dle", members: ["Miyeon", "Minnie", "Soyeon", "Yuqi", "Shuhua", "Soojin"], aka: ["(G)I-DLE", "GIDLE"] },
  { name: "ILLIT", members: ["Yunah", "Minju", "Moka", "Wonhee", "Iroha"] },
  { name: "ITZY", members: ["Yeji", "Lia", "Ryujin", "Chaeryeong", "Yuna"] },
  { name: "IVE", members: ["Yujin", "Gaeul", "Rei", "Wonyoung", "Liz", "Leeseo"] },
  { name: "izna" },
  { name: "Kep1er", members: ["Yujin", "Mashiro", "Xiaoting", "Chaehyun", "Dayeon", "Hikaru", "Bahiyyih", "Youngeun", "Yeseo"] },
  { name: "KiiiKiii" },
  { name: "KISS OF LIFE", members: ["Julie", "Natty", "Belle", "Haneul"] },
  { name: "LE SSERAFIM", members: ["Chaewon", "Sakura", "Yunjin", "Kazuha", "Eunchae", "Garam"] },
  { name: "LIGHTSUM" },
  { name: "LOONA", members: ["Heejin", "Hyunjin", "Haseul", "Yeojin", "ViVi", "Kim Lip", "Jinsoul", "Choerry", "Yves", "Chuu", "Go Won", "Olivia Hye"] },
  { name: "Lovelyz" },
  { name: "MAMAMOO", members: ["Solar", "Moonbyul", "Wheein", "Hwasa"] },
  { name: "MEOVV" },
  { name: "miss A", members: ["Fei", "Jia", "Min", "Suzy"] },
  { name: "MOMOLAND" },
  { name: "NewJeans", members: ["Minji", "Hanni", "Danielle", "Haerin", "Hyein"], aka: ["NJZ"] },
  { name: "NiziU", members: ["Mako", "Rio", "Maya", "Riku", "Ayaka", "Mayuka", "Rima", "Miihi", "Nina"] },
  { name: "NMIXX", members: ["Lily", "Haewon", "Sullyoon", "Bae", "Jiwoo", "Kyujin", "Jinni"] },
  { name: "OH MY GIRL", members: ["Hyojung", "Mimi", "YooA", "Seunghee", "Yubin", "Arin", "Jiho", "Binnie", "JinE"] },
  { name: "PURPLE KISS" },
  { name: "QWER", members: ["Chodan", "Magenta", "Hina", "Siyeon"] },
  { name: "Red Velvet", members: ["Irene", "Seulgi", "Wendy", "Joy", "Yeri"] },
  { name: "Rocket Punch" },
  { name: "SAY MY NAME" },
  { name: "STAYC", members: ["Sumin", "Sieun", "Isa", "Seeun", "Yoon", "J"] },
  { name: "T-ara" },
  { name: "tripleS" },
  { name: "TWICE", members: ["Nayeon", "Jeongyeon", "Momo", "Sana", "Jihyo", "Mina", "Dahyun", "Chaeyoung", "Tzuyu"] },
  { name: "UNIS" },
  { name: "VIVIZ", members: ["Eunha", "SinB", "Umji"] },
  { name: "Weeekly" },
  { name: "Weki Meki" },
  { name: "Wonder Girls", members: ["Sunye", "Yeeun", "Sunmi", "Sohee", "Yubin", "Hyerim"] },
  { name: "WJSN", aka: ["Cosmic Girls"] },
  { name: "Woo!ah!" },
  // 男團
  { name: "&TEAM", members: ["K", "Fuma", "Nicholas", "EJ", "Yuma", "Jo", "Harua", "Taki", "Maki"] },
  { name: "2PM", members: ["Jun. K", "Nichkhun", "Taecyeon", "Wooyoung", "Junho", "Chansung"] },
  { name: "AB6IX" },
  { name: "ALPHA DRIVE ONE" },
  { name: "ASTRO", members: ["MJ", "Jinjin", "Cha Eun-woo", "Moonbin", "Rocky", "Sanha"] },
  { name: "ATEEZ", members: ["Hongjoong", "Seonghwa", "Yunho", "Yeosang", "San", "Mingi", "Wooyoung", "Jongho"] },
  { name: "BIGBANG", members: ["G-Dragon", "T.O.P", "Taeyang", "Daesung", "Seungri"] },
  { name: "BOYNEXTDOOR", members: ["Sungho", "Riwoo", "Jaehyun", "Taesan", "Leehan", "Woonhak"] },
  { name: "BTOB" },
  { name: "BTS", members: ["RM", "Jin", "Suga", "J-Hope", "Jimin", "V", "Jungkook"] },
  { name: "CIX" },
  { name: "CNBLUE" },
  { name: "CORTIS", members: ["Martin", "James", "Juhoon", "Seonghyeon", "Keonho"] },
  { name: "CRAVITY" },
  { name: "DAY6", members: ["Sungjin", "Jae", "Young K", "Wonpil", "Dowoon"] },
  { name: "ENHYPEN", members: ["Jungwon", "Heeseung", "Jay", "Jake", "Sunghoon", "Sunoo", "Ni-ki"] },
  { name: "EPEX" },
  { name: "EVNNE" },
  { name: "EXO", members: ["Xiumin", "Suho", "Lay", "Baekhyun", "Chen", "Chanyeol", "D.O.", "Kai", "Sehun"] },
  { name: "FTISLAND" },
  { name: "Golden Child" },
  { name: "GOT7", members: ["Jay B", "Mark", "Jackson", "Jinyoung", "Youngjae", "BamBam", "Yugyeom"] },
  { name: "Highlight" },
  { name: "iKON" },
  { name: "INFINITE" },
  { name: "KickFlip" },
  { name: "LNGSHOT" },
  { name: "MONSTA X", members: ["Shownu", "Minhyuk", "Kihyun", "Hyungwon", "Jooheon", "I.M", "Wonho"] },
  { name: "N.Flying" },
  { name: "NCT", aka: ["NCT U"] },
  { name: "NCT 127", members: ["Taeil", "Johnny", "Taeyong", "Yuta", "Doyoung", "Jaehyun", "Winwin", "Jungwoo", "Mark", "Haechan"] },
  { name: "NCT DREAM", members: ["Mark", "Renjun", "Jeno", "Haechan", "Jaemin", "Chenle", "Jisung"] },
  { name: "NCT WISH", members: ["Sion", "Riku", "Yushi", "Jaehee", "Ryo", "Sakuya"] },
  { name: "NEXZ", members: ["Tomoya", "Yu", "Haru", "So Geon", "Seita", "Hyui", "Yuki"] },
  { name: "NU'EST" },
  { name: "ONEUS" },
  { name: "ONF" },
  { name: "P1Harmony", members: ["Keeho", "Theo", "Jiung", "Intak", "Soul", "Jongseob"] },
  { name: "PENTAGON" },
  { name: "PLAVE", members: ["Yejun", "Noah", "Bamby", "Eunho", "Hamin"] },
  { name: "RIIZE", members: ["Shotaro", "Eunseok", "Sungchan", "Wonbin", "Seunghan", "Sohee", "Anton"] },
  { name: "SEVENTEEN", members: ["S.Coups", "Jeonghan", "Joshua", "Jun", "Hoshi", "Wonwoo", "Woozi", "DK", "Mingyu", "The8", "Seungkwan", "Vernon", "Dino"] },
  { name: "SF9" },
  { name: "SHINee", members: ["Onew", "Jonghyun", "Key", "Minho", "Taemin"] },
  { name: "Stray Kids", members: ["Bang Chan", "Lee Know", "Changbin", "Hyunjin", "Han", "Felix", "Seungmin", "I.N"] },
  { name: "Super Junior", members: ["Leeteuk", "Heechul", "Yesung", "Kangin", "Shindong", "Sungmin", "Eunhyuk", "Siwon", "Donghae", "Ryeowook", "Kyuhyun"] },
  { name: "TEMPEST" },
  { name: "THE BOYZ", members: ["Sangyeon", "Jacob", "Younghoon", "Hyunjae", "Juyeon", "Kevin", "New", "Q", "Ju Haknyeon", "Sunwoo", "Eric", "Hwall"] },
  { name: "The Rose" },
  { name: "TOMORROW X TOGETHER", members: ["Soobin", "Yeonjun", "Beomgyu", "Taehyun", "Hueningkai"], aka: ["TXT"] },
  { name: "TREASURE", members: ["Hyunsuk", "Jihoon", "Yoshi", "Junkyu", "Mashiho", "Jaehyuk", "Asahi", "Yedam", "Doyoung", "Haruto", "Jeongwoo", "Junghwan"] },
  { name: "TWS", members: ["Shinyu", "Dohoon", "Youngjae", "Hanjin", "Jihoon", "Kyungmin"] },
  { name: "VERIVERY" },
  { name: "VICTON" },
  { name: "VIXX" },
  { name: "Wanna One" },
  { name: "WayV", members: ["Kun", "Ten", "Winwin", "Lucas", "Xiaojun", "Hendery", "Yangyang"] },
  { name: "WINNER" },
  { name: "xikers" },
  { name: "ZEROBASEONE", members: ["Hanbin", "Jiwoong", "Zhang Hao", "Matthew", "Taerae", "Ricky", "Gyuvin", "Gunwook", "Yujin"], aka: ["ZB1"] },
  // 混聲團體
  { name: "AKMU" },
  { name: "ALLDAY PROJECT" },
  { name: "KARD" },
];

const norm = (s: string) => s.trim().toLowerCase();

// 名錄加上圖鑑裡的團體（圖鑑的成員併進來），按名稱排序
function buildDirectory(): DirectoryGroup[] {
  const byName = new Map(KPOP_GROUPS.map((g) => [norm(g.name), { ...g, members: g.members ? [...g.members] : undefined }]));
  for (const g of GROUPS) {
    const hit = byName.get(norm(g.name));
    if (!hit) byName.set(norm(g.name), { name: g.name, members: [...g.members] });
    else hit.members = [...new Set([...(hit.members ?? []), ...g.members])];
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

export const GROUP_DIRECTORY = buildDirectory();

// 用名稱或別名（例如 TXT、SNSD）找團體
export const findDirectoryGroup = (name: string) => {
  const q = norm(name);
  return q ? GROUP_DIRECTORY.find((g) => norm(g.name) === q || g.aka?.some((a) => norm(a) === q)) : undefined;
};

// 團體欄的建議清單：別名可以搜得到，並顯示在右側
export const groupOptions = GROUP_DIRECTORY.map((g) => ({ value: g.name, hint: g.aka?.join(" · "), keywords: g.aka }));
