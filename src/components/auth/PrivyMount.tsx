"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { privyRequested, subscribePrivy } from "@/lib/privy/bridge";

// Privy 的 SDK 只在有人要用收藏錢包時才下載（lib/privy/bridge.ts 的 requestPrivy），其他訪客的頁面不帶它
const PrivyHost = dynamic(() => import("./PrivyHost"), { ssr: false });

export default function PrivyMount() {
  const requested = useSyncExternalStore(subscribePrivy, privyRequested, () => false);
  return requested ? <PrivyHost /> : null;
}
