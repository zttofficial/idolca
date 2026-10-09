import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/hero/Hero";
import TradeTicker from "@/components/market/TradeTicker";
import MarketGrid from "@/components/market/MarketGrid";
import HowItWorks from "@/components/landing/HowItWorks";

export default function Home() {
  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <TradeTicker />
        <MarketGrid />
        <HowItWorks />
      </main>
      <footer className="border-t border-white/5 py-10 text-center text-xs text-white/35">
        © 2026 PocaVault · 展示資料皆為虛構
      </footer>
    </>
  );
}
