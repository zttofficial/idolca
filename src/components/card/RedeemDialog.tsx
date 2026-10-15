"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import AddressDialog from "@/components/shipping/AddressDialog";
import { CA_PROVINCES, redeemCharge, redeemFeeUsd, vaultCountries, type ShippingAddress } from "@/lib/shipping";
import type { VaultId } from "@/lib/vaults";

// 申請提貨：填收件地址（共用的收件地址表單），確認後錢包簽一筆交易（凍結 NFT、付運費和稅）。
// 卡從它所在的金庫寄出：國家只列那個金庫寄得到的，運費按（金庫，國家）計價，選好國家就在說明裡顯示；
// 加拿大境內的寄送另收 GST/HST，選好省份後顯示稅額；送出按鈕顯示運費加稅的總額。實際收多少由伺服器用同一個 redeemCharge 算
export default function RedeemDialog({ vault, busy, onSubmit, onClose }: { vault: VaultId; busy: boolean; onSubmit: (address: ShippingAddress) => void; onClose: () => void }) {
  const t = useTranslations("Detail");
  const tVault = useTranslations("Vaults");
  const locale = useLocale();
  const names = useMemo(() => new Intl.DisplayNames([locale], { type: "region" }), [locale]);
  const percent = useMemo(() => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 3 }), [locale]);
  const countries = useMemo(() => vaultCountries(vault), [vault]);
  const from = tVault(vault);
  const region = (a: ShippingAddress) => a.region.trim().toUpperCase();
  return (
    <AddressDialog
      title={t("redeemTitle")}
      body={t("redeemBody")}
      countries={countries}
      note={(a) => {
        const fee = redeemFeeUsd(vault, a.country);
        // 還沒選國家時是空字串，舊地址也可能存著不合格的代碼；Intl.DisplayNames.of 遇到這兩種會丟錯，整個表單跟著崩潰
        let country = a.country;
        try {
          if (a.country) country = names.of(a.country) ?? a.country;
        } catch {}
        const rates = (
          <Link href="/shipping" target="_blank" className="mt-2 inline-block font-semibold text-ink underline underline-offset-2">
            {t("redeemRates")}
          </Link>
        );
        if (fee === null)
          return (
            <>
              <p>{a.country ? t("redeemNoShip", { vault: from, country }) : t("redeemFeePick", { vault: from })}</p>
              {rates}
            </>
          );
        const charge = redeemCharge(vault, { country: a.country, region: region(a) });
        return (
          <>
            <p>{t("redeemFee", { vault: from, country, fee: formatPrice(fee, 2) })}</p>
            {charge ? (
              charge.taxCents > 0 && (
                <p className="mt-1">{t("redeemTax", { province: CA_PROVINCES[region(a)], rate: percent.format(charge.taxRate), tax: formatPrice(charge.taxCents / 100, 2) })}</p>
              )
            ) : (
              <p className="mt-1">{t("redeemTaxPick")}</p>
            )}
            {rates}
          </>
        );
      }}
      submitLabel={(a) => {
        const charge = redeemCharge(vault, { country: a.country, region: region(a) });
        return charge ? t("redeemSubmitFee", { fee: formatPrice(charge.totalCents / 100, 2) }) : t("redeemSubmit");
      }}
      busyLabel={t("confirmInWallet")}
      busy={busy}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
