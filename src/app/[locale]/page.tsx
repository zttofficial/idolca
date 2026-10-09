import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/hero/Hero";
import TradeTicker from "@/components/market/TradeTicker";
import MarketGrid from "@/components/market/MarketGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import Footer from "@/components/layout/Footer";

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
      <Footer />
    </>
  );
}
