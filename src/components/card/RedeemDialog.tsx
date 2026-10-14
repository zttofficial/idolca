"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import AddressDialog from "@/components/shipping/AddressDialog";
import { redeemFeeUsd, vaultCountries, type ShippingAddress } from "@/lib/shipping";
import type { VaultId } from "@/lib/vaults";

// 申請提貨：填收件地址（共用的收件地址表單），確認後錢包簽一筆交易（凍結 NFT、付運費）。
// 卡從它所在的金庫寄出：國家只列那個金庫寄得到的，運費按（金庫，國家）計價，選好國家就在說明和送出按鈕上顯示金額；
// 實際收多少由伺服器按同一份報價表算
export default function RedeemDialog({ vault, busy, onSubmit, onClose }: { vault: VaultId; busy: boolean; onSubmit: (address: ShippingAddress) => void; onClose: () => void }) {
  const t = useTranslations("Detail");
  const tVault = useTranslations("Vaults");
  const locale = useLocale();
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const countries = useMemo(() => vaultCountries(vault), [vault]);
  const from = tVault(vault);
  const fee = (a: ShippingAddress) => redeemFeeUsd(vault, a.country);
  return (
    <AddressDialog
      title={t("redeemTitle")}
      body={t("redeemBody")}
      countries={countries}
      note={(a) => {
        const usd = fee(a);
        if (usd !== null) return t("redeemFee", { vault: from, country: names.of(a.country) ?? a.country, fee: formatPrice(usd, 2) });
        return a.country ? t("redeemNoShip", { vault: from, country: names.of(a.country) ?? a.country }) : t("redeemFeePick", { vault: from });
      }}
      submitLabel={(a) => {
        const usd = fee(a);
        return usd === null ? t("redeemSubmit") : t("redeemSubmitFee", { fee: formatPrice(usd, 2) });
      }}
      busyLabel={t("confirmInWallet")}
      busy={busy}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
