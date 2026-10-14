"use client";

import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import AddressDialog from "@/components/shipping/AddressDialog";
import { REDEEM_FEE_USDT, type ShippingAddress } from "@/lib/shipping";

// 申請提貨：填收件地址（共用的收件地址表單），確認後錢包簽一筆交易（凍結 NFT、付運費）
export default function RedeemDialog({ busy, onSubmit, onClose }: { busy: boolean; onSubmit: (address: ShippingAddress) => void; onClose: () => void }) {
  const t = useTranslations("Detail");
  return (
    <AddressDialog
      title={t("redeemTitle")}
      body={t("redeemBody")}
      note={t("redeemFee", { fee: formatPrice(REDEEM_FEE_USDT, 2) })}
      submitLabel={t("redeemSubmit")}
      busyLabel={t("confirmInWallet")}
      busy={busy}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
