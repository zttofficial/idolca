import { useTranslations } from "next-intl";
import { CLUSTER } from "@/lib/solana/config";

export default function Footer() {
  const t = useTranslations("Footer");
  return (
    <footer className="border-t border-line py-10 text-center text-xs text-ink-3">
      {t("text", { cluster: CLUSTER === "devnet" ? "Devnet" : "Mainnet" })}
    </footer>
  );
}
