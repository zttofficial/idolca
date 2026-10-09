import { CLUSTER } from "@/lib/solana/config";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-10 text-center text-xs text-white/35">
      © 2026 Idolca · Solana {CLUSTER === "devnet" ? "Devnet" : "Mainnet"} · 展示資料皆為虛構
    </footer>
  );
}
