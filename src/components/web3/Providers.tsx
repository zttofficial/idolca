"use client";

import AccountProvider from "@/components/auth/AccountProvider";

// 帳號是我們自己的：郵箱 + 密碼，或瀏覽器錢包簽名登入（見 AccountModal），不依賴第三方登入服務
export default function Web3Providers({ children }: { children: React.ReactNode }) {
  return <AccountProvider>{children}</AccountProvider>;
}
