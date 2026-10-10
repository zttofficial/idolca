import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/hero/Hero";
import MarketGrid from "@/components/market/MarketGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import Footer from "@/components/layout/Footer";
import PackPromo from "@/components/packs/PackPromo";
import BinderPromo from "@/components/binder/BinderPromo";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <PackPromo />
        <MarketGrid />
        <BinderPromo />
        <HowItWorks />
      </main>
      <Footer />
    </>
  );
}
