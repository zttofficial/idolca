// 團體名錄的一筆：name 是篩選和表單顯示的名稱；aka 是別名（縮寫、原文寫法），搜尋和照片檔名都認；
// members 是成員（或演員），只收得到可靠資料的，其餘留空由用戶自填
export type DirectoryGroup = { name: string; members?: string[]; aka?: string[] };
