// 照片上傳前在瀏覽器裡裁好，和伺服器的處理流程（src/lib/server/media.ts）一致
const OUT_W = 660;
const OUT_H = 1020;

// 置中裁成 55:85 再上傳；伺服器端會再驗證、加浮水印
export async function cropToCard(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const ratio = OUT_W / OUT_H;
    let sw = img.width;
    let sh = img.height;
    if (sw / sh > ratio) sw = sh * ratio;
    else sh = sw / ratio;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    canvas.getContext("2d")!.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, OUT_W, OUT_H);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

