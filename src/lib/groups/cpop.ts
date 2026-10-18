// C-pop（華語）名錄。內娛周邊以時代峰峻（TF 家族）的官方小卡、簽名拍立得為主，另收選秀團、48 系、港台偶像團和個人偶像、演員。
// name 用官方中文名的原寫法（大陸團體和藝人用簡體，港台用繁體或官方英文名）；aka 放繁簡另一種寫法、英文名和常見簡稱，搜尋和照片檔名都認。
// members 用官方中文寫法（大陸用簡體、港台用繁體或通用藝名），包含已離隊的成員；48 系成員多，只列總決選前列、隊長等主要成員。
// 個人條目只收不在任何現役團名單裡的藝人，避免照片檔名辨識混淆；已解散或停止活動的團的前成員可以另有個人條目。
// 成員只收得到可靠資料的，其餘留空由用戶自填。

import type { DirectoryGroup } from "./types";

export const CPOP_GROUPS: DirectoryGroup[] = [
  // 時代峰峻
  { name: "TFBOYS", members: ["王俊凯", "王源", "易烊千玺"] },
  {
    name: "TOP登陆少年",
    members: ["朱志鑫", "苏新皓", "张极", "张泽禹", "左航", "余宇涵"],
    aka: ["TOP登陸少年", "登陆少年", "T.O.P", "TransfOrmProject"],
  },
  {
    name: "时代少年团",
    members: ["马嘉祺", "丁程鑫", "宋亚轩", "刘耀文", "张真源", "严浩翔", "贺峻霖"],
    aka: ["時代少年團", "TNT", "Teens in Times"],
  },
  // 選秀團
  {
    name: "INTO1",
    members: ["刘宇", "赞多", "米卡", "高卿尘", "林墨", "伯远", "张嘉元", "利路修", "尹浩宇", "周柯宇", "刘彰"],
  },
  {
    name: "NINE PERCENT",
    members: ["蔡徐坤", "陈立农", "范丞丞", "黄明昊", "林彦俊", "朱正廷", "王子异", "王琳凯", "尤长靖"],
    aka: ["百分九少年"],
  },
  {
    name: "R1SE",
    members: ["周震南", "何洛洛", "焉栩嘉", "夏之光", "姚琛", "翟潇闻", "张颜齐", "刘也", "任豪", "赵磊", "赵让"],
  },
  {
    name: "THE9",
    members: ["刘雨昕", "虞书欣", "许佳琪", "喻言", "谢可寅", "安崎", "赵小棠", "孔雪儿", "陆柯燃"],
  },
  {
    name: "UNINE",
    members: ["李汶翰", "李振宁", "姚明明", "夏瀚宇", "管栎", "胡春杨", "陈宥维", "嘉羿", "李希侃"],
  },
  {
    name: "火箭少女101",
    members: ["孟美岐", "吴宣仪", "杨超越", "段奥娟", "Yamy", "赖美云", "紫宁", "杨芸晴", "李紫婷", "傅菁", "徐梦洁"],
    aka: ["Rocket Girls 101"],
  },
  {
    name: "硬糖少女303",
    members: ["王艺瑾", "赵粤", "希林娜依·高", "刘些宁", "陈卓璇", "郑乃馨", "张艺凡"],
    aka: ["硬糖少女", "BonBon Girls 303"],
  },
  // 48 系
  {
    name: "BEJ48",
    members: ["段艺璇", "李梓", "苏杉杉", "顼凘炀", "孙语姗", "张怀瑾", "张梦慧", "陈蓁蓁", "李想", "张笑盈", "朱虹蓉", "杨晔"],
  },
  {
    name: "CKG48",
    members: ["田倩兰", "毛译晗", "张爱静", "胡丹", "冉蔚", "王露皎", "李慧"],
  },
  {
    name: "GNZ48",
    members: ["刘力菲", "谢蕾蕾", "郑丹妮", "朱怡欣", "陈珂", "张琼予", "吴羽霏", "张昕", "方琪", "曾艾佳", "罗寒月", "黄楚茵", "杨若惜", "卢静", "农燕萍", "龙亦瑞", "项宇婧"],
  },
  {
    name: "SNH48",
    members: [
      "吴哲晗",
      "赵嘉敏",
      "鞠婧祎",
      "李艺彤",
      "黄婷婷",
      "曾艳芬",
      "冯薪朵",
      "莫寒",
      "陆婷",
      "孙芮",
      "沈梦瑶",
      "袁一琦",
      "杨冰怡",
      "赵佳蕊",
      "戴萌",
      "孔肖吟",
      "许佳琪",
      "张语格",
      "赵粤",
      "钱蓓婷",
      "万丽娜",
      "徐子轩",
      "王奕",
    ],
  },
  // 其他團體
  {
    name: "BOY STORY",
    members: ["贾涵予", "李梓豪", "贺鑫隆", "于泽宇", "苟明睿", "任书漾"],
  },
  {
    name: "SING女团",
    members: ["许诗茵", "陈丽", "王文洁", "陈温柔", "龚天颖", "蔡莎", "林津伊", "赖美云", "边丽", "秦瑜", "蒋申", "林慧", "吴瑶", "林嘉慧", "尹万蕊", "钟颖", "马雪娇"],
    aka: ["SING女團", "SING"],
  },
  { name: "UNIQ", members: ["曹承衍", "周艺轩", "王一博", "李汶翰", "金圣柱"] },
  {
    name: "X玖少年团",
    members: ["伍嘉成", "彭楚粤", "赵磊", "夏之光", "谷嘉诚", "郭子凡", "肖战", "焉栩嘉", "陈泽希"],
    aka: ["X玖少年團", "X NINE", "XNINE"],
  },
  {
    name: "坤音四子",
    members: ["木子洋", "灵超", "卜凡", "岳岳"],
    aka: ["ONER"],
  },
  {
    name: "乐华七子NEXT",
    members: ["朱正廷", "毕雯珺", "黄新淳", "范丞丞", "黄明昊", "丁泽仁", "李权哲"],
    aka: ["樂華七子NEXT", "乐华七子", "NEXT", "NEX7"],
  },
  // 香港
  {
    name: "COLLAR",
    members: ["沈貞巧", "王家晴", "許軼", "蘇雅琳", "邱彥筒", "李芯駖", "陳泳伽", "蘇芷晴"],
  },
  { name: "ERROR", members: ["梁業", "何啟華", "郭嘉駿", "吳保錡"] },
  {
    name: "MIRROR",
    members: ["陳瑞輝", "王智德", "楊樂文", "邱士縉", "江𤒹生", "柳應廷", "陳卓賢", "盧瀚霆", "李駿傑", "呂爵安", "姜濤", "邱傲然"],
  },
  // 台灣
  { name: "Energy", members: ["牛奶", "書偉", "Toro", "坤達", "阿弟", "小剛"] },
  {
    name: "SpeXial",
    members: ["宏正", "偉晉", "明杰", "子閎", "晨翔", "Evan", "Teddy", "風田", "以綸", "易恩", "Dylan", "執"],
  },
  {
    name: "飛輪海",
    members: ["吳尊", "辰亦儒", "汪東城", "炎亞綸"],
    aka: ["飞轮海", "Fahrenheit"],
  },
  // 個人
  { name: "白鹿", members: ["白鹿"], aka: ["Bai Lu"] },
  { name: "蔡徐坤", members: ["蔡徐坤"], aka: ["Cai Xukun", "KUN"] },
  { name: "成毅", members: ["成毅"], aka: ["Cheng Yi"] },
  { name: "邓为", members: ["邓为"], aka: ["鄧為", "Deng Wei"] },
  { name: "迪丽热巴", members: ["迪丽热巴"], aka: ["迪麗熱巴", "Dilraba"] },
  { name: "丁禹兮", members: ["丁禹兮"], aka: ["Ding Yuxi"] },
  { name: "龚俊", members: ["龚俊"], aka: ["龔俊", "Gong Jun"] },
  { name: "华晨宇", members: ["华晨宇"], aka: ["華晨宇", "Hua Chenyu"] },
  {
    name: "黄子韬",
    members: ["黄子韬"],
    aka: ["黃子韜", "Huang Zitao", "Z.TAO"],
  },
  { name: "鞠婧祎", members: ["鞠婧祎"], aka: ["鞠婧禕", "Ju Jingyi"] },
  { name: "李现", members: ["李现"], aka: ["李現", "Li Xian"] },
  { name: "刘宇宁", members: ["刘宇宁"], aka: ["劉宇寧", "Liu Yuning"] },
  { name: "鹿晗", members: ["鹿晗"], aka: ["Lu Han", "Luhan"] },
  { name: "罗云熙", members: ["罗云熙"], aka: ["羅雲熙", "Luo Yunxi"] },
  {
    name: "任嘉伦",
    members: ["任嘉伦"],
    aka: ["任嘉倫", "Ren Jialun", "Allen Ren"],
  },
  { name: "檀健次", members: ["檀健次"], aka: ["Tan Jianci"] },
  {
    name: "王鹤棣",
    members: ["王鹤棣"],
    aka: ["王鶴棣", "Wang Hedi", "Dylan Wang"],
  },
  { name: "王一博", members: ["王一博"], aka: ["Wang Yibo"] },
  { name: "肖战", members: ["肖战"], aka: ["肖戰", "Xiao Zhan", "Sean Xiao"] },
  { name: "杨超越", members: ["杨超越"], aka: ["楊超越", "Yang Chaoyue"] },
  { name: "杨幂", members: ["杨幂"], aka: ["楊冪", "Yang Mi"] },
  { name: "杨洋", members: ["杨洋"], aka: ["楊洋", "Yang Yang"] },
  { name: "杨紫", members: ["杨紫"], aka: ["楊紫", "Yang Zi"] },
  {
    name: "虞书欣",
    members: ["虞书欣"],
    aka: ["虞書欣", "Yu Shuxin", "Esther Yu"],
  },
  { name: "张凌赫", members: ["张凌赫"], aka: ["張凌赫", "Zhang Linghe"] },
  { name: "赵丽颖", members: ["赵丽颖"], aka: ["趙麗穎", "Zhao Liying"] },
  { name: "赵露思", members: ["赵露思"], aka: ["趙露思", "Zhao Lusi"] },
  { name: "周深", members: ["周深"], aka: ["Zhou Shen", "Charlie Zhou"] },
  { name: "朱一龙", members: ["朱一龙"], aka: ["朱一龍", "Zhu Yilong"] },
];
