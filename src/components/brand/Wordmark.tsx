// 文字標誌：小寫粗體「idolca」，i 的點換成一張斜放的小卡（主色）。
// 扁平、單色，不用圖示框和漸變；大小跟著父元素的字號走
export default function Wordmark({ className = "", tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <span
      aria-label="Idolca"
      role="img"
      className={`inline-flex items-baseline leading-none font-extrabold tracking-[-0.045em] ${tone === "white" ? "text-white" : "text-ink"} ${className}`}
    >
      <span aria-hidden className="relative">
        ı
        <span
          className={`absolute top-[-0.2em] left-1/2 h-[0.3em] w-[0.21em] -translate-x-1/2 rotate-[14deg] rounded-[0.05em] ${tone === "white" ? "bg-white" : "bg-accent"}`}
        />
      </span>
      <span aria-hidden>dolca</span>
    </span>
  );
}
