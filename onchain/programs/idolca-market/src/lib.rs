//! Idolca 掛單託管程序。
//!
//! 賣家掛單時，卡片的 Metaplex Core 資產轉進以資產地址為種子的 Listing PDA；
//! 買家付款時，貨款（扣除平台抽成）、抽成和資產在同一筆交易裡交換，Listing 帳戶關閉、租金退回賣家。
//! 只接受 Config 裡登記的 USDT 和 USDC，只接受平台集合裡的資產。
//!
//! 拍賣：賣家開拍時資產轉進以資產地址為種子的 Auction PDA。每次出價都先付全額，款項存進 Auction PDA 的代幣帳戶，
//! 同一個指令把前一位最高出價者的款項退回，所以得標者早就付了錢，不會棄標。截止前 extend_secs 內有新出價就延長截止時間。
//! 截止後任何人都能呼叫 settle：達到保底價時資產給得標者、貨款扣抽成給賣家；沒人出價或沒達到保底價時資產退回賣家、出價全額退回。
//! 拍賣的抽成、起標價下限、時長範圍和延長時間存在 AuctionConfig，開拍時把抽成記在 Auction 上，之後改設定不影響進行中的拍賣。

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked};
use mpl_core::instructions::TransferV1CpiBuilder;

declare_id!("4vQ6uRMFPRfU79JuwwriDVRoFsEZBCSW2FnsefwmtetD");

pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

/// 抽成上限 10%
pub const MAX_FEE_BPS: u16 = 1_000;

pub const CONFIG_SEED: &[u8] = b"config";
pub const LISTING_SEED: &[u8] = b"listing";
pub const AUCTION_CONFIG_SEED: &[u8] = b"auction_config";
pub const AUCTION_SEED: &[u8] = b"auction";

/// 結算代幣的 1 元（USDT、USDC 都是 6 位小數）
pub const UNIT: u64 = 1_000_000;

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

    /// 拍賣設定：只有 Config 的 authority 能建立和修改
    pub fn init_auction_config(ctx: Context<InitAuctionConfig>, args: AuctionConfigArgs) -> Result<()> {
        args.validate()?;
        ctx.accounts.auction_config.set_inner(args.into_config(ctx.bumps.auction_config));
        Ok(())
    }

    pub fn update_auction_config(ctx: Context<UpdateAuctionConfig>, args: AuctionConfigArgs) -> Result<()> {
        args.validate()?;
        let bump = ctx.accounts.auction_config.bump;
        ctx.accounts.auction_config.set_inner(args.into_config(bump));
        Ok(())
    }

    /// 開拍：資產轉進 Auction PDA，同時建好存放出價的代幣帳戶。reserve_price 為 0 表示不設保底價
    pub fn create_auction(ctx: Context<CreateAuction>, start_price: u64, reserve_price: u64, duration_secs: i64) -> Result<()> {
        let rules = &ctx.accounts.auction_config;
        require!(start_price >= rules.min_start, MarketError::StartTooLow);
        require!(reserve_price == 0 || reserve_price >= start_price, MarketError::InvalidReserve);
        require!(duration_secs >= rules.min_duration && duration_secs <= rules.max_duration, MarketError::InvalidDuration);

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.seller.to_account_info()))
            .new_owner(&ctx.accounts.auction.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        let end_ts = Clock::get()?.unix_timestamp + duration_secs;
        ctx.accounts.auction.set_inner(Auction {
            seller: ctx.accounts.seller.key(),
            asset: ctx.accounts.asset.key(),
            payment_mint: ctx.accounts.payment_mint.key(),
            start_price,
            reserve_price,
            end_ts,
            high_bidder: Pubkey::default(),
            high_bid: 0,
            bid_count: 0,
            fee_bps: rules.fee_bps,
            bump: ctx.bumps.auction,
        });

        emit!(AuctionCreated {
            asset: ctx.accounts.asset.key(),
            seller: ctx.accounts.seller.key(),
            payment_mint: ctx.accounts.payment_mint.key(),
            start_price,
            reserve_price,
            end_ts,
        });
        Ok(())
    }

    /// 出價：全額轉進拍賣的代幣帳戶，同一個指令退回前一位最高出價者。沒有前一位時 prev_bidder 傳出價者自己
    pub fn bid(ctx: Context<Bid>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let auction = &ctx.accounts.auction;
        let bidder = ctx.accounts.bidder.key();
        require!(now < auction.end_ts, MarketError::AuctionEnded);
        require!(bidder != auction.seller, MarketError::SellerCannotBid);
        if auction.bid_count == 0 {
            require!(ctx.accounts.prev_bidder.key() == bidder, MarketError::WrongBidder);
        } else {
            require!(bidder != auction.high_bidder, MarketError::AlreadyLeading);
            require!(ctx.accounts.prev_bidder.key() == auction.high_bidder, MarketError::WrongBidder);
        }
        require!(amount >= min_next_bid(auction.high_bid, auction.start_price, auction.bid_count), MarketError::BidTooLow);

        let decimals = ctx.accounts.payment_mint.decimals;
        let token_program = ctx.accounts.token_program.key();
        token_interface::transfer_checked(
            CpiContext::new(
                token_program,
                TransferChecked {
                    from: ctx.accounts.bidder_token.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
            decimals,
        )?;

        if auction.bid_count > 0 {
            let asset_key = auction.asset;
            let seeds: &[&[u8]] = &[AUCTION_SEED, asset_key.as_ref(), &[auction.bump]];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    token_program,
                    TransferChecked {
                        from: ctx.accounts.escrow.to_account_info(),
                        mint: ctx.accounts.payment_mint.to_account_info(),
                        to: ctx.accounts.prev_bidder_token.to_account_info(),
                        authority: ctx.accounts.auction.to_account_info(),
                    },
                    &[seeds],
                ),
                auction.high_bid,
                decimals,
            )?;
        }

        let extend = ctx.accounts.auction_config.extend_secs;
        let auction = &mut ctx.accounts.auction;
        auction.high_bidder = bidder;
        auction.high_bid = amount;
        auction.bid_count += 1;
        if auction.end_ts - now < extend {
            auction.end_ts = now + extend;
        }

        emit!(BidPlaced {
            asset: auction.asset,
            bidder,
            amount,
            end_ts: auction.end_ts,
        });
        Ok(())
    }

    /// 結標：截止後任何人都能呼叫（平台的排程負責），手續費和新建代幣帳戶的租金由呼叫者付。
    /// 有出價且達到保底價時成交，否則資產退回賣家、最高出價全額退回。拍賣帳戶和代幣帳戶關閉，租金退回賣家
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let auction = &ctx.accounts.auction;
        require!(Clock::get()?.unix_timestamp >= auction.end_ts, MarketError::AuctionNotEnded);
        let sold = auction.bid_count > 0 && (auction.reserve_price == 0 || auction.high_bid >= auction.reserve_price);
        let fee = if sold { fee_for(auction.high_bid, auction.fee_bps) } else { 0 };

        let asset_key = auction.asset;
        let seeds: &[&[u8]] = &[AUCTION_SEED, asset_key.as_ref(), &[auction.bump]];
        let a = &ctx.accounts;
        if sold {
            escrow_pay(a, &a.seller_token, auction.high_bid - fee, seeds)?;
            if fee > 0 {
                escrow_pay(a, &a.treasury_token, fee, seeds)?;
            }
        } else if auction.bid_count > 0 {
            escrow_pay(a, &a.high_bidder_token, auction.high_bid, seeds)?;
        }

        let new_owner = if sold { a.high_bidder.to_account_info() } else { a.seller.to_account_info() };
        TransferV1CpiBuilder::new(&a.mpl_core_program.to_account_info())
            .asset(&a.asset.to_account_info())
            .collection(Some(&a.collection.to_account_info()))
            .payer(&a.cranker.to_account_info())
            .authority(Some(&a.auction.to_account_info()))
            .new_owner(&new_owner)
            .system_program(Some(&a.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;

        close_escrow(&a.token_program, &a.escrow, &a.seller.to_account_info(), &a.auction.to_account_info(), seeds)?;

        emit!(AuctionSettled {
            asset: asset_key,
            seller: auction.seller,
            winner: if sold { Some(auction.high_bidder) } else { None },
            price: if sold { auction.high_bid } else { 0 },
            fee,
        });
        Ok(())
    }

    /// 賣家取消：只有還沒人出價時可以
    pub fn cancel_auction(ctx: Context<CancelAuction>) -> Result<()> {
        let auction = &ctx.accounts.auction;
        require!(auction.bid_count == 0, MarketError::HasBids);
        let asset_key = auction.asset;
        let seeds: &[&[u8]] = &[AUCTION_SEED, asset_key.as_ref(), &[auction.bump]];
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.seller.to_account_info())
            .authority(Some(&ctx.accounts.auction.to_account_info()))
            .new_owner(&ctx.accounts.seller.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;
        close_escrow(&ctx.accounts.token_program, &ctx.accounts.escrow, &ctx.accounts.seller.to_account_info(), &ctx.accounts.auction.to_account_info(), seeds)?;

        emit!(AuctionCancelled {
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

/// 下一口最低出價：第一口是起標價；之後 50 元以下至少加 1 元，50 到 200 元至少加 5 元，200 元以上至少加 2.5%（無條件進位）
pub fn min_next_bid(high_bid: u64, start_price: u64, bid_count: u32) -> u64 {
    if bid_count == 0 {
        return start_price;
    }
    let step = if high_bid < 50 * UNIT {
        UNIT
    } else if high_bid < 200 * UNIT {
        5 * UNIT
    } else {
        ((high_bid as u128 * 250 + 9_999) / 10_000) as u64
    };
    high_bid.saturating_add(step)
}

// 從拍賣的代幣帳戶付款（給賣家、收款錢包或退款給出價者），由 Auction PDA 簽名
fn escrow_pay<'info>(accounts: &SettleAuction<'info>, to: &InterfaceAccount<'info, TokenAccount>, amount: u64, seeds: &[&[u8]]) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.key(),
            TransferChecked {
                from: accounts.escrow.to_account_info(),
                mint: accounts.payment_mint.to_account_info(),
                to: to.to_account_info(),
                authority: accounts.auction.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        accounts.payment_mint.decimals,
    )
}

// 拍賣結束時關閉存放出價的代幣帳戶（此時餘額為 0），租金退回賣家
fn close_escrow<'info>(
    token_program: &Interface<'info, TokenInterface>,
    escrow: &InterfaceAccount<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    seeds: &[&[u8]],
) -> Result<()> {
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: escrow.to_account_info(),
            destination: destination.clone(),
            authority: authority.clone(),
        },
        &[seeds],
    ))
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

#[account]
#[derive(InitSpace)]
pub struct AuctionConfig {
    pub fee_bps: u16,
    /// 起標價下限（結算代幣的最小單位）
    pub min_start: u64,
    /// 拍賣時長範圍（秒）
    pub min_duration: i64,
    pub max_duration: i64,
    /// 截止前這麼多秒內有新出價，截止時間延到出價後這麼多秒
    pub extend_secs: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AuctionConfigArgs {
    pub fee_bps: u16,
    pub min_start: u64,
    pub min_duration: i64,
    pub max_duration: i64,
    pub extend_secs: i64,
}

impl AuctionConfigArgs {
    fn validate(&self) -> Result<()> {
        require!(self.fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        require!(self.min_duration > 0 && self.max_duration >= self.min_duration, MarketError::InvalidDuration);
        require!(self.extend_secs >= 0 && self.extend_secs <= 86_400, MarketError::InvalidDuration);
        Ok(())
    }

    fn into_config(self, bump: u8) -> AuctionConfig {
        AuctionConfig {
            fee_bps: self.fee_bps,
            min_start: self.min_start,
            min_duration: self.min_duration,
            max_duration: self.max_duration,
            extend_secs: self.extend_secs,
            bump,
        }
    }
}

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub payment_mint: Pubkey,
    pub start_price: u64,
    /// 0 表示不設保底價
    pub reserve_price: u64,
    pub end_ts: i64,
    /// 還沒人出價時是預設值（全 0）
    pub high_bidder: Pubkey,
    pub high_bid: u64,
    pub bid_count: u32,
    /// 開拍時的抽成，之後改設定不影響這場
    pub fee_bps: u16,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitAuctionConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(init, payer = authority, space = 8 + AuctionConfig::INIT_SPACE, seeds = [AUCTION_CONFIG_SEED], bump)]
    pub auction_config: Account<'info, AuctionConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAuctionConfig<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [AUCTION_CONFIG_SEED], bump = auction_config.bump)]
    pub auction_config: Account<'info, AuctionConfig>,
}

#[derive(Accounts)]
pub struct CreateAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [AUCTION_CONFIG_SEED], bump = auction_config.bump)]
    pub auction_config: Account<'info, AuctionConfig>,
    #[account(
        init,
        payer = seller,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, asset.key().as_ref()],
        bump,
    )]
    pub auction: Account<'info, Auction>,
    /// 存放出價的代幣帳戶，屬於 Auction PDA
    #[account(
        init,
        payer = seller,
        associated_token::mint = payment_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
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
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(seeds = [AUCTION_CONFIG_SEED], bump = auction_config.bump)]
    pub auction_config: Account<'info, AuctionConfig>,
    #[account(mut, seeds = [AUCTION_SEED, auction.asset.as_ref()], bump = auction.bump, has_one = payment_mint)]
    pub auction: Account<'info, Auction>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
        token::token_program = token_program,
    )]
    pub bidder_token: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: 前一位最高出價者（沒有時是出價者自己），在指令裡核對
    pub prev_bidder: UncheckedAccount<'info>,
    /// 退款收款帳戶。前一位出價者關掉了 USDT 帳戶也照樣能退（由這次的出價者建回來），沒人能用關帳戶擋住別人出價。
    /// 第一口出價時它就是出價者自己的帳戶，不會轉帳
    #[account(
        init_if_needed,
        dup,
        payer = bidder,
        associated_token::mint = payment_mint,
        associated_token::authority = prev_bidder,
        associated_token::token_program = token_program,
    )]
    pub prev_bidder_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    /// 呼叫者：付手續費和新建代幣帳戶的租金
    #[account(mut)]
    pub cranker: Signer<'info>,
    /// CHECK: 必須是拍賣的賣家，收貨款和兩個帳戶的租金
    #[account(mut, address = auction.seller)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: 最高出價者；沒人出價時傳賣家
    #[account(
        constraint = high_bidder.key() == if auction.bid_count > 0 { auction.high_bidder } else { auction.seller } @ MarketError::WrongBidder
    )]
    pub high_bidder: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = seller, seeds = [AUCTION_SEED, asset.key().as_ref()], bump = auction.bump, has_one = asset, has_one = payment_mint)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = payment_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token: InterfaceAccount<'info, TokenAccount>,
    /// 流拍時的退款帳戶；沒人出價時就是賣家的帳戶，不會轉帳
    #[account(
        init_if_needed,
        dup,
        payer = cranker,
        associated_token::mint = payment_mint,
        associated_token::authority = high_bidder,
        associated_token::token_program = token_program,
    )]
    pub high_bidder_token: InterfaceAccount<'info, TokenAccount>,
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
pub struct CancelAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = seller, seeds = [AUCTION_SEED, asset.key().as_ref()], bump = auction.bump, has_one = seller, has_one = asset, has_one = payment_mint)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct AuctionCreated {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub payment_mint: Pubkey,
    pub start_price: u64,
    pub reserve_price: u64,
    pub end_ts: i64,
}

#[event]
pub struct BidPlaced {
    pub asset: Pubkey,
    pub bidder: Pubkey,
    pub amount: u64,
    pub end_ts: i64,
}

#[event]
pub struct AuctionSettled {
    pub asset: Pubkey,
    pub seller: Pubkey,
    /// 流拍時為空
    pub winner: Option<Pubkey>,
    pub price: u64,
    pub fee: u64,
}

#[event]
pub struct AuctionCancelled {
    pub asset: Pubkey,
    pub seller: Pubkey,
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
    #[msg("起標價低於下限")]
    StartTooLow,
    #[msg("保底價不能低於起標價")]
    InvalidReserve,
    #[msg("拍賣時長不在允許範圍內")]
    InvalidDuration,
    #[msg("拍賣已截止")]
    AuctionEnded,
    #[msg("拍賣還沒截止")]
    AuctionNotEnded,
    #[msg("出價低於下一口最低價")]
    BidTooLow,
    #[msg("賣家不能對自己的拍賣出價")]
    SellerCannotBid,
    #[msg("你已經是最高出價者")]
    AlreadyLeading,
    #[msg("出價者帳戶不符")]
    WrongBidder,
    #[msg("已經有人出價，不能取消")]
    HasBids,
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

    #[test]
    fn bid_steps() {
        assert_eq!(min_next_bid(0, 10 * UNIT, 0), 10 * UNIT);
        assert_eq!(min_next_bid(10 * UNIT, 10 * UNIT, 1), 11 * UNIT);
        assert_eq!(min_next_bid(50 * UNIT, 10 * UNIT, 3), 55 * UNIT);
        assert_eq!(min_next_bid(200 * UNIT, 10 * UNIT, 9), 205 * UNIT);
        // 2.5% 無條件進位到最小單位
        assert_eq!(min_next_bid(201 * UNIT + 1, 10 * UNIT, 9), 201 * UNIT + 1 + 5_025_001);
    }
}
