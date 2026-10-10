// 樣本卡照片的網址。/api/media 的回應按網址長期快取，圖片在資料庫裡也按 id 存，
// 所以照片的處理方式（裁切、浮水印）一改，就把 SAMPLE_REV 加一：id 跟著變，伺服器重新生成，瀏覽器和 CDN 也拿新圖
export const SAMPLE_REV = 3;
export const sampleId = (card: string) => `sample-r${SAMPLE_REV}-${card}`;
export const sampleImage = (card: string) => `/api/media/${sampleId(card)}`;
