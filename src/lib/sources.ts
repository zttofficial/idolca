// 小卡的來源。專輯只是其中一種，飯圈常見的來源都列出來；自由上鏈時必選，預設專輯
export const CARD_SOURCES = [
  "album",
  "pob",
  "luckydraw",
  "fansign",
  "concert",
  "seasons",
  "fanclub",
  "popup",
  "broadcast",
  "collab",
  "other",
] as const;

export type CardSource = (typeof CARD_SOURCES)[number];

export const isCardSource = (s: unknown): s is CardSource => CARD_SOURCES.includes(s as CardSource);
