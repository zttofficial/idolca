import { notFound } from "next/navigation";

// 沒有對應頁面的網址交給 [locale]/not-found：顯示帶導航和當前語言的 404 頁，而不是 Next 的預設頁
export default function CatchAll() {
  notFound();
}
