// 列表卡（HoloTile、ListingTile）載入中的佔位：卡面加三行文字，高度和真的列表卡一致，資料到了版面不跳
export default function TileSkeleton() {
  return (
    <div aria-hidden>
      <div className="aspect-[55/85] animate-pulse rounded-2xl bg-surface-2" />
      <div className="mt-3 space-y-2 px-1">
        <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
        <div className="h-5 w-20 animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
}
