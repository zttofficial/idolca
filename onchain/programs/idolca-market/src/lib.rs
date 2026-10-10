//! Idolca 掛單託管程序。
//!
//! 賣家掛單時，卡片的 Metaplex Core 資產轉進以資產地址為種子的 Listing PDA；
//! 買家付款時，貨款（扣除平台抽成）、抽成和資產在同一筆交易裡交換，Listing 帳戶關閉、租金退回賣家。
//! 只接受 Config 裡登記的 USDT 和 USDC，只接受平台集合裡的資產。

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use mpl_core::instructions::TransferV1CpiBuilder;

declare_id!("4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD");

pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

/// 抽成上限 10%
pub const MAX_FEE_BPS: u16 = 1_000;

pub const CONFIG_SEED: &[u8] = b"config";
pub const LISTING_SEED: &[u8] = b"listing";

#[program]
pub mod idolca_market {
    use super::*;

    /// 只有程序的升級權限持有人能初始化，防止部署後被搶先寫入配置
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        ctx.accounts.config.set_inner(Config {
            authority: ctx.accounts.authority.key(),
            treasury: ctx.accounts.treasury.key(),
            collection: ctx.accounts.collection.key(),
            usdt_mint: ctx.accounts.usdt_mint.key(),
            usdc_mint: ctx.accounts.usdc_mint.key(),
            fee_bps,
            bump: ctx.bumps.config,
        });
        Ok(())
    }

    pub fn update_config(ctx: Context<UpdateConfig>, fee_bps: u16, treasury: Pubkey) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        let config = &mut ctx.accounts.config;
        config.fee_bps = fee_bps;
        config.treasury = treasury;
        Ok(())
    }

    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        require!(price > 0, MarketError::InvalidPrice);

        // 賣家簽名，資產轉進 Listing PDA。凍結中（提貨申請中）的資產會被 Core 拒絕
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.seller.to_account_info()))
            .new_owner(&ctx.accounts.listing.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        ctx.accounts.listing.set_inner(Listing {
            seller: ctx.accounts.seller.key(),
            asset: ctx.accounts.asset.key(),
            payment_mint: ctx.accounts.payment_mint.key(),
            price,
            bump: ctx.bumps.listing,
        });

        emit!(Listed {
            asset: ctx.accounts.asset.key(),
            seller: ctx.accounts.seller.key(),
            payment_mint: ctx.accounts.payment_mint.key(),
            price,
        });
        Ok(())
    }

    /// `expected_price` 防止賣家在買家簽名後改價（目前不支持改價，留作前端的價格確認）
    pub fn buy(ctx: Context<Buy>, expected_price: u64) -> Result<()> {
        let listing = &ctx.accounts.listing;
        require!(listing.price == expected_price, MarketError::PriceMismatch);

        let price = listing.price;
        let fee = fee_for(price, ctx.accounts.config.fee_bps);
        let decimals = ctx.accounts.payment_mint.decimals;

        transfer_tokens(&ctx.accounts, &ctx.accounts.seller_token, price - fee, decimals)?;
        if fee > 0 {
            transfer_tokens(&ctx.accounts, &ctx.accounts.treasury_token, fee, decimals)?;
        }

        let asset_key = ctx.accounts.asset.key();
        let seeds: &[&[u8]] = &[LISTING_SEED, asset_key.as_ref(), &[listing.bump]];
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.buyer.to_account_info())
            .authority(Some(&ctx.accounts.listing.to_account_info()))
            .new_owner(&ctx.accounts.buyer.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;

        emit!(Sold {
            asset: asset_key,
            seller: ctx.accounts.seller.key(),
            buyer: ctx.accounts.buyer.key(),
            payment_mint: ctx.accounts.payment_mint.key(),
            price,
            fee,
        });
        Ok(())
    }

    pub fn cancel(ctx: Context<Cancel>) -> Result<()> {
        let asset_key = ctx.accounts.asset.key();
        let seeds: &[&[u8]] = &[LISTING_SEED, asset_key.as_ref(), &[ctx.accounts.listing.bump]];
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.listing.to_account_info()))
            .new_owner(&ctx.accounts.seller.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;

        emit!(Cancelled {
            asset: asset_key,
            seller: ctx.accounts.seller.key(),
        });
        Ok(())
    }
}

pub fn fee_for(price: u64, fee_bps: u16) -> u64 {
    // fee_bps ≤ 1000，結果不會超過 price，轉回 u64 不會溢出
    (price as u128 * fee_bps as u128 / 10_000) as u64
}

// 買家付款給賣家或平台。直接傳需要的帳戶，不傳整個 Context（Anchor 1.x 的 Context 對生命週期是不變的）
fn transfer_tokens<'info>(
    accounts: &Buy<'info>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: u64,
    decimals: u8,
) -> Result<()> {
    let transfer = TransferChecked {
        from: accounts.buyer_token.to_account_info(),
        mint: accounts.payment_mint.to_account_info(),
        to: to.to_account_info(),
        authority: accounts.buyer.to_account_info(),
    };
    token_interface::transfer_checked(CpiContext::new(accounts.token_program.key(), transfer), amount, decimals)
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    /// 抽成收款錢包；抽成打進它對應結算代幣的 ATA
    pub treasury: Pubkey,
    /// 平台的 Metaplex Core 集合，只接受這個集合裡的資產
    pub collection: Pubkey,
    pub usdt_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Listing {
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub payment_mint: Pubkey,
    /// 以結算代幣的最小單位計（USDT、USDC 都是 6 位小數）
    pub price: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: 只記錄地址
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: 只記錄地址，轉移時由 Metaplex Core 校驗資產屬於該集合
    pub collection: UncheckedAccount<'info>,
    pub usdt_mint: InterfaceAccount<'info, Mint>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(constraint = program.programdata_address()? == Some(program_data.key()))]
    pub program: Program<'info, crate::program::IdolcaMarket>,
    #[account(constraint = program_data.upgrade_authority_address == Some(authority.key()) @ MarketError::Unauthorized)]
    pub program_data: Account<'info, ProgramData>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct List<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = seller,
        space = 8 + Listing::INIT_SPACE,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗擁有者和集合
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    #[account(
        constraint = payment_mint.key() == config.usdt_mint || payment_mint.key() == config.usdc_mint
            @ MarketError::UnsupportedPaymentMint
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: 必須是掛單的賣家，收貨款和 Listing 的租金
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = asset,
        has_one = payment_mint,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = token_program,
    )]
    pub buyer_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = payment_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: 必須是 Config 登記的收款錢包
    #[account(address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = seller,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = asset,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct Listed {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
}

#[event]
pub struct Sold {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub payment_mint: Pubkey,
    pub price: u64,
    pub fee: u64,
}

#[event]
pub struct Cancelled {
    pub asset: Pubkey,
    pub seller: Pubkey,
}

#[error_code]
pub enum MarketError {
    #[msg("抽成不能超過 10%")]
    FeeTooHigh,
    #[msg("價格必須大於 0")]
    InvalidPrice,
    #[msg("只接受 USDT 或 USDC")]
    UnsupportedPaymentMint,
    #[msg("掛單價格和預期不符")]
    PriceMismatch,
    #[msg("無權操作")]
    Unauthorized,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fee_rounds_down() {
        assert_eq!(fee_for(1_280_000_000, 250), 32_000_000);
        assert_eq!(fee_for(99, 250), 2);
        assert_eq!(fee_for(1, 250), 0);
        assert_eq!(fee_for(u64::MAX, MAX_FEE_BPS), u64::MAX / 10);
    }
}
