import type { Pack } from "@/lib/packs";
import Wordmark from "@/components/brand/Wordmark";

// 卡包包裝：純 CSS 鋁箔質感，名字和標誌印在包上
export default function PackArt({ pack, className = "" }: { pack: Pack; className?: string }) {
  return (
    <div
      className={`pack-art ${className}`}
      style={{ "--c1": pack.palette[0], "--c2": pack.palette[1] } as React.CSSProperties}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
        <Wordmark tone="white" className="text-2xl" />
        <p className="mt-4 text-[10px] font-semibold tracking-[0.3em] text-white/80">RANDOM TRADING CARD</p>
        <p className="mt-1 text-2xl leading-tight font-black tracking-tight drop-shadow">{pack.name}</p>
        <p className="mt-6 text-[10px] font-semibold tracking-[0.2em] text-white/70">ON SOLANA</p>
      </div>
    </div>
  );
}
