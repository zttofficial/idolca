import { useTranslations } from "next-intl";
import { CLUSTER } from "@/lib/solana/config";

export default function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-white/5 py-10 text-center text-xs text-white/35">
      {t("text", { cluster: CLUSTER === "devnet" ? "Devnet" : "Mainnet" })}
    </footer>
  );
}
