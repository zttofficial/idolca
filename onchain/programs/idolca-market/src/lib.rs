//! Idolca 掛單託管程序。
//!
//! 賣家掛單時，卡片的 Metaplex Core 資產轉進以資產地址為種子的 Listing PDA；
//! 買家付款時，貨款（扣除平台抽成）、抽成和資產在同一筆交易裡交換，Listing 帳戶關閉、租金退回付租金的人。
//! 價格以美元計（6 位小數），買家用 Config 登記的 USDT 或 USDC 付都可以，賣家收到買家付的那一種。只接受平台集合裡的資產。
//!
//! 拍賣：賣家開拍時資產轉進以資產地址為種子的 Auction PDA，同時為兩種結算代幣各開一個存放出價的代幣帳戶。
//! 每次出價都先付全額（USDT 或 USDC 都可以），同一個指令用原幣退回前一位最高出價者，所以得標者早就付了錢，不會棄標。
//! 截止前 extend_secs 內有新出價就延長截止時間。截止後任何人都能呼叫 settle：達到保底價時資產給得標者、貨款扣抽成用得標那口的幣種給賣家；
//! 沒人出價或沒達到保底價時資產退回賣家、出價全額退回。拍賣的抽成、起標價下限、時長範圍和延長時間存在 AuctionConfig，
//! 開拍時把抽成記在 Auction 上，之後改設定不影響進行中的拍賣。
//!
//! 租金：建立帳戶的指令都有獨立的 payer 簽名者付租金（平台替沒有 SOL 的用戶付），Listing、Auction 記下 rent_payer，
//! 關閉時租金退回給它，不會流到賣家手上。

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

/// 結算代幣的 1 元。價格以美元的百萬分之一計，兩種代幣都必須是 6 位小數
pub const UNIT: u64 = 1_000_000;
pub const DECIMALS: u8 = 6;

/// 帳戶格式版本；舊版（沒有這個欄位）的帳戶由 migrate_listing、migrate_auction 處理
pub const ACCOUNT_VERSION: u8 = 2;
/// 舊版帳戶的長度（含 8 位元組的識別碼），遷移時靠它認出舊帳戶
pub const LEGACY_LISTING_LEN: usize = 8 + 32 + 32 + 32 + 8 + 1;
pub const LEGACY_AUCTION_LEN: usize = 8 + 32 * 3 + 8 * 3 + 32 + 8 + 4 + 2 + 1;

#[program]
pub mod idolca_market {
    use super::*;

    /// 只有程序的升級權限持有人能初始化，防止部署後被搶先寫入配置
    pub fn initialize(ctx: Context<Initialize>, fee_bps: u16) -> Result<()> {
        require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);
        require!(ctx.accounts.usdt_mint.decimals == DECIMALS && ctx.accounts.usdc_mint.decimals == DECIMALS, MarketError::UnsupportedPaymentMint);
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

    /// 換登記的結算代幣（devnet 用平台自鑄的測試幣）。進行中的拍賣存放出價的帳戶是按舊代幣開的，換之前要先結束
    pub fn set_mints(ctx: Context<SetMints>) -> Result<()> {
        require!(ctx.accounts.usdt_mint.decimals == DECIMALS && ctx.accounts.usdc_mint.decimals == DECIMALS, MarketError::UnsupportedPaymentMint);
        let config = &mut ctx.accounts.config;
        config.usdt_mint = ctx.accounts.usdt_mint.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        Ok(())
    }

    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        require!(price > 0, MarketError::InvalidPrice);

        // 賣家簽名，資產轉進 Listing PDA。凍結中（提貨申請中）的資產會被 Core 拒絕
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
            .authority(Some(&ctx.accounts.seller.to_account_info()))
            .new_owner(&ctx.accounts.listing.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        ctx.accounts.listing.set_inner(Listing {
            version: ACCOUNT_VERSION,
            seller: ctx.accounts.seller.key(),
            asset: ctx.accounts.asset.key(),
            price,
            rent_payer: ctx.accounts.payer.key(),
            bump: ctx.bumps.listing,
        });

        emit!(Listed {
            asset: ctx.accounts.asset.key(),
            seller: ctx.accounts.seller.key(),
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

        transfer_tokens(&ctx.accounts, &ctx.accounts.seller_token, price - fee)?;
        if fee > 0 {
            transfer_tokens(&ctx.accounts, &ctx.accounts.treasury_token, fee)?;
        }

        let asset_key = ctx.accounts.asset.key();
        let seeds: &[&[u8]] = &[LISTING_SEED, asset_key.as_ref(), &[listing.bump]];
        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
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
            .payer(&ctx.accounts.payer.to_account_info())
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

    /// 開拍：資產轉進 Auction PDA，同時為 USDT、USDC 各建一個存放出價的代幣帳戶。reserve_price 為 0 表示不設保底價
    pub fn create_auction(ctx: Context<CreateAuction>, start_price: u64, reserve_price: u64, duration_secs: i64) -> Result<()> {
        let rules = &ctx.accounts.auction_config;
        require!(start_price >= rules.min_start, MarketError::StartTooLow);
        require!(reserve_price == 0 || reserve_price >= start_price, MarketError::InvalidReserve);
        require!(duration_secs >= rules.min_duration && duration_secs <= rules.max_duration, MarketError::InvalidDuration);

        TransferV1CpiBuilder::new(&ctx.accounts.mpl_core_program.to_account_info())
            .asset(&ctx.accounts.asset.to_account_info())
            .collection(Some(&ctx.accounts.collection.to_account_info()))
            .payer(&ctx.accounts.payer.to_account_info())
            .authority(Some(&ctx.accounts.seller.to_account_info()))
            .new_owner(&ctx.accounts.auction.to_account_info())
            .system_program(Some(&ctx.accounts.system_program.to_account_info()))
            .invoke()?;

        let end_ts = Clock::get()?.unix_timestamp + duration_secs;
        ctx.accounts.auction.set_inner(Auction {
            version: ACCOUNT_VERSION,
            seller: ctx.accounts.seller.key(),
            asset: ctx.accounts.asset.key(),
            start_price,
            reserve_price,
            end_ts,
            high_bidder: Pubkey::default(),
            high_bid: 0,
            high_bid_mint: Pubkey::default(),
            bid_count: 0,
            fee_bps: rules.fee_bps,
            rent_payer: ctx.accounts.payer.key(),
            bump: ctx.bumps.auction,
        });

        emit!(AuctionCreated {
            asset: ctx.accounts.asset.key(),
            seller: ctx.accounts.seller.key(),
            start_price,
            reserve_price,
            end_ts,
        });
        Ok(())
    }

    /// 出價：全額轉進拍賣存放 bid_mint 的代幣帳戶，同一個指令用前一口的幣種退回前一位最高出價者。
    /// 沒有前一位時 prev_bidder 傳出價者自己、prev_mint 傳 bid_mint
    pub fn bid(ctx: Context<Bid>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let auction = &ctx.accounts.auction;
        let bidder = ctx.accounts.bidder.key();
        require!(now < auction.end_ts, MarketError::AuctionEnded);
        require!(bidder != auction.seller, MarketError::SellerCannotBid);
        if auction.bid_count == 0 {
            require!(ctx.accounts.prev_bidder.key() == bidder, MarketError::WrongBidder);
            require!(ctx.accounts.prev_mint.key() == ctx.accounts.bid_mint.key(), MarketError::WrongBidder);
        } else {
            require!(bidder != auction.high_bidder, MarketError::AlreadyLeading);
            require!(ctx.accounts.prev_bidder.key() == auction.high_bidder, MarketError::WrongBidder);
            require!(ctx.accounts.prev_mint.key() == auction.high_bid_mint, MarketError::WrongBidder);
        }
        require!(amount >= min_next_bid(auction.high_bid, auction.start_price, auction.bid_count), MarketError::BidTooLow);

        let token_program = ctx.accounts.token_program.key();
        token_interface::transfer_checked(
            CpiContext::new(
                token_program,
                TransferChecked {
                    from: ctx.accounts.bidder_token.to_account_info(),
                    mint: ctx.accounts.bid_mint.to_account_info(),
                    to: ctx.accounts.bid_escrow.to_account_info(),
                    authority: ctx.accounts.bidder.to_account_info(),
                },
            ),
            amount,
            DECIMALS,
        )?;

        if auction.bid_count > 0 {
            let asset_key = auction.asset;
            let seeds: &[&[u8]] = &[AUCTION_SEED, asset_key.as_ref(), &[auction.bump]];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    token_program,
                    TransferChecked {
                        from: ctx.accounts.prev_escrow.to_account_info(),
                        mint: ctx.accounts.prev_mint.to_account_info(),
                        to: ctx.accounts.prev_bidder_token.to_account_info(),
                        authority: ctx.accounts.auction.to_account_info(),
                    },
                    &[seeds],
                ),
                auction.high_bid,
                DECIMALS,
            )?;
        }

        let extend = ctx.accounts.auction_config.extend_secs;
        let bid_mint = ctx.accounts.bid_mint.key();
        let auction = &mut ctx.accounts.auction;
        auction.high_bidder = bidder;
        auction.high_bid = amount;
        auction.high_bid_mint = bid_mint;
        auction.bid_count += 1;
        if auction.end_ts - now < extend {
            auction.end_ts = now + extend;
        }

        emit!(BidPlaced {
            asset: auction.asset,
            bidder,
            payment_mint: bid_mint,
            amount,
            end_ts: auction.end_ts,
        });
        Ok(())
    }

    /// 結標：截止後任何人都能呼叫（平台的排程負責），手續費和新建代幣帳戶的租金由呼叫者付。
    /// 有出價且達到保底價時成交，否則資產退回賣家、最高出價全額退回。拍賣帳戶和兩個代幣帳戶關閉，租金退回付租金的人
    pub fn settle_auction(ctx: Context<SettleAuction>) -> Result<()> {
        let auction = &ctx.accounts.auction;
        require!(Clock::get()?.unix_timestamp >= auction.end_ts, MarketError::AuctionNotEnded);
        let sold = auction.bid_count > 0 && (auction.reserve_price == 0 || auction.high_bid >= auction.reserve_price);
        let fee = if sold { fee_for(auction.high_bid, auction.fee_bps) } else { 0 };

        let asset_key = auction.asset;
        let seeds: &[&[u8]] = &[AUCTION_SEED, asset_key.as_ref(), &[auction.bump]];
        let a = &ctx.accounts;
        // 得標那口的幣種存在哪個代幣帳戶
        let escrow = if a.win_mint.key() == a.usdt_mint.key() { &a.usdt_escrow } else { &a.usdc_escrow };
        if sold {
            escrow_pay(a, escrow, &a.seller_token, auction.high_bid - fee, seeds)?;
            if fee > 0 {
                escrow_pay(a, escrow, &a.treasury_token, fee, seeds)?;
            }
        } else if auction.bid_count > 0 {
            escrow_pay(a, escrow, &a.high_bidder_token, auction.high_bid, seeds)?;
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

        let rent_payer = a.rent_payer.to_account_info();
        let authority = a.auction.to_account_info();
        close_escrow(&a.token_program, &a.usdt_escrow, &rent_payer, &authority, seeds)?;
        close_escrow(&a.token_program, &a.usdc_escrow, &rent_payer, &authority, seeds)?;

        emit!(AuctionSettled {
            asset: asset_key,
            seller: auction.seller,
            winner: if sold { Some(auction.high_bidder) } else { None },
            payment_mint: if sold { Some(auction.high_bid_mint) } else { None },
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
        let a = &ctx.accounts;
        TransferV1CpiBuilder::new(&a.mpl_core_program.to_account_info())
            .asset(&a.asset.to_account_info())
            .collection(Some(&a.collection.to_account_info()))
            .payer(&a.payer.to_account_info())
            .authority(Some(&a.auction.to_account_info()))
            .new_owner(&a.seller.to_account_info())
            .system_program(Some(&a.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;
        let rent_payer = a.rent_payer.to_account_info();
        let authority = a.auction.to_account_info();
        close_escrow(&a.token_program, &a.usdt_escrow, &rent_payer, &authority, seeds)?;
        close_escrow(&a.token_program, &a.usdc_escrow, &rent_payer, &authority, seeds)?;

        emit!(AuctionCancelled {
            asset: asset_key,
            seller: a.seller.key(),
        });
        Ok(())
    }

    /// 遷移舊版掛單（只有 Config 的 authority 能呼叫）：資產退回賣家，帳戶關閉、租金退回賣家（舊版由賣家付租金）
    pub fn migrate_listing(ctx: Context<MigrateListing>) -> Result<()> {
        let a = &ctx.accounts;
        let info = a.listing.to_account_info();
        let (seller, asset, bump) = {
            let data = info.try_borrow_data()?;
            require!(data.len() == LEGACY_LISTING_LEN && data[..8] == *Listing::DISCRIMINATOR, MarketError::NotLegacy);
            (read_key(&data, 8), read_key(&data, 8 + 32), data[8 + 104])
        };
        require!(seller == a.seller.key() && asset == a.asset.key(), MarketError::NotLegacy);

        let seeds: &[&[u8]] = &[LISTING_SEED, asset.as_ref(), &[bump]];
        TransferV1CpiBuilder::new(&a.mpl_core_program.to_account_info())
            .asset(&a.asset.to_account_info())
            .collection(Some(&a.collection.to_account_info()))
            .payer(&a.authority.to_account_info())
            .authority(Some(&info))
            .new_owner(&a.seller.to_account_info())
            .system_program(Some(&a.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;
        close_raw(&info, &a.seller.to_account_info())?;

        emit!(Cancelled { asset, seller });
        Ok(())
    }

    /// 遷移舊版拍賣（只有 Config 的 authority 能呼叫）：不論是否截止，最高出價全額退回、資產退回賣家，
    /// 代幣帳戶和拍賣帳戶關閉、租金退回賣家（舊版由賣家付租金）
    pub fn migrate_auction(ctx: Context<MigrateAuction>) -> Result<()> {
        let a = &ctx.accounts;
        let info = a.auction.to_account_info();
        let (seller, asset, mint, high_bidder, high_bid, bid_count, bump) = {
            let data = info.try_borrow_data()?;
            require!(data.len() == LEGACY_AUCTION_LEN && data[..8] == *Auction::DISCRIMINATOR, MarketError::NotLegacy);
            let o = 8;
            (
                read_key(&data, o),
                read_key(&data, o + 32),
                read_key(&data, o + 64),
                read_key(&data, o + 120),
                u64::from_le_bytes(data[o + 152..o + 160].try_into().unwrap()),
                u32::from_le_bytes(data[o + 160..o + 164].try_into().unwrap()),
                data[o + 166],
            )
        };
        require!(seller == a.seller.key() && asset == a.asset.key() && mint == a.payment_mint.key(), MarketError::NotLegacy);
        let refund_to = if bid_count > 0 { high_bidder } else { seller };
        require!(a.high_bidder.key() == refund_to, MarketError::WrongBidder);

        let seeds: &[&[u8]] = &[AUCTION_SEED, asset.as_ref(), &[bump]];
        if bid_count > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    a.token_program.key(),
                    TransferChecked {
                        from: a.escrow.to_account_info(),
                        mint: a.payment_mint.to_account_info(),
                        to: a.high_bidder_token.to_account_info(),
                        authority: info.clone(),
                    },
                    &[seeds],
                ),
                high_bid,
                a.payment_mint.decimals,
            )?;
        }
        TransferV1CpiBuilder::new(&a.mpl_core_program.to_account_info())
            .asset(&a.asset.to_account_info())
            .collection(Some(&a.collection.to_account_info()))
            .payer(&a.authority.to_account_info())
            .authority(Some(&info))
            .new_owner(&a.seller.to_account_info())
            .system_program(Some(&a.system_program.to_account_info()))
            .invoke_signed(&[seeds])?;
        close_escrow(&a.token_program, &a.escrow, &a.seller.to_account_info(), &info, seeds)?;
        close_raw(&info, &a.seller.to_account_info())?;

        emit!(AuctionCancelled { asset, seller });
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

/// Config 登記的結算代幣，且是 6 位小數
fn accepted(config: &Config, mint: &InterfaceAccount<Mint>) -> bool {
    (mint.key() == config.usdt_mint || mint.key() == config.usdc_mint) && mint.decimals == DECIMALS
}

fn read_key(data: &[u8], at: usize) -> Pubkey {
    Pubkey::new_from_array(data[at..at + 32].try_into().unwrap())
}

// 關閉不是用 Account<T> 載入的帳戶（舊版格式）：租金轉走、資料清空、交還系統程序
fn close_raw<'info>(info: &AccountInfo<'info>, destination: &AccountInfo<'info>) -> Result<()> {
    destination.add_lamports(info.lamports())?;
    **info.lamports.borrow_mut() = 0;
    info.assign(&anchor_lang::solana_program::system_program::ID);
    info.resize(0).map_err(Into::into)
}

// 從拍賣的代幣帳戶付款（給賣家、收款錢包或退款給出價者），由 Auction PDA 簽名
fn escrow_pay<'info>(
    accounts: &SettleAuction<'info>,
    escrow: &Box<InterfaceAccount<'info, TokenAccount>>,
    to: &Box<InterfaceAccount<'info, TokenAccount>>,
    amount: u64,
    seeds: &[&[u8]],
) -> Result<()> {
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.key(),
            TransferChecked {
                from: escrow.to_account_info(),
                mint: accounts.win_mint.to_account_info(),
                to: to.to_account_info(),
                authority: accounts.auction.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        DECIMALS,
    )
}

// 拍賣結束時關閉存放出價的代幣帳戶（此時餘額為 0），租金退回付租金的人
fn close_escrow<'info>(
    token_program: &Interface<'info, TokenInterface>,
    escrow: &Box<InterfaceAccount<'info, TokenAccount>>,
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
fn transfer_tokens<'info>(accounts: &Buy<'info>, to: &Box<InterfaceAccount<'info, TokenAccount>>, amount: u64) -> Result<()> {
    let transfer = TransferChecked {
        from: accounts.buyer_token.to_account_info(),
        mint: accounts.payment_mint.to_account_info(),
        to: to.to_account_info(),
        authority: accounts.buyer.to_account_info(),
    };
    token_interface::transfer_checked(CpiContext::new(accounts.token_program.key(), transfer), amount, DECIMALS)
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
    pub version: u8,
    pub seller: Pubkey,
    pub asset: Pubkey,
    /// 美元價格（百萬分之一），買家用 USDT 或 USDC 付都是這個數
    pub price: u64,
    /// 付 Listing 租金的人，帳戶關閉時租金退回給它
    pub rent_payer: Pubkey,
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
pub struct SetMints<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub usdt_mint: InterfaceAccount<'info, Mint>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
}

#[derive(Accounts)]
pub struct List<'info> {
    pub seller: Signer<'info>,
    /// 付 Listing 的租金和 Core 轉移的費用
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
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
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    pub buyer: Signer<'info>,
    /// 付賣家新代幣帳戶的租金和 Core 轉移的費用
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: 必須是掛單的賣家，收貨款
    pub seller: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = rent_payer,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = asset,
        has_one = rent_payer,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: 必須是付 Listing 租金的人，收回租金
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// 買家這次用來付款的代幣：USDT 或 USDC
    #[account(constraint = accepted(&config, &payment_mint) @ MarketError::UnsupportedPaymentMint)]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = buyer,
        token::token_program = token_program,
    )]
    pub buyer_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = payment_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: 必須是 Config 登記的收款錢包
    #[account(address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Cancel<'info> {
    pub seller: Signer<'info>,
    /// 付 Core 轉移的費用
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        close = rent_payer,
        seeds = [LISTING_SEED, asset.key().as_ref()],
        bump = listing.bump,
        has_one = seller,
        has_one = asset,
        has_one = rent_payer,
    )]
    pub listing: Account<'info, Listing>,
    /// CHECK: 必須是付 Listing 租金的人，收回租金
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
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
    /// 起標價下限（美元的百萬分之一）
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
    pub version: u8,
    pub seller: Pubkey,
    pub asset: Pubkey,
    pub start_price: u64,
    /// 0 表示不設保底價
    pub reserve_price: u64,
    pub end_ts: i64,
    /// 還沒人出價時是預設值（全 0）
    pub high_bidder: Pubkey,
    pub high_bid: u64,
    /// 最高出價用的幣種；還沒人出價時是預設值
    pub high_bid_mint: Pubkey,
    pub bid_count: u32,
    /// 開拍時的抽成，之後改設定不影響這場
    pub fee_bps: u16,
    /// 付拍賣帳戶和兩個代幣帳戶租金的人，關閉時租金退回給它
    pub rent_payer: Pubkey,
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
    pub seller: Signer<'info>,
    /// 付拍賣帳戶、兩個代幣帳戶的租金和 Core 轉移的費用
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [AUCTION_CONFIG_SEED], bump = auction_config.bump)]
    pub auction_config: Account<'info, AuctionConfig>,
    #[account(
        init,
        payer = payer,
        space = 8 + Auction::INIT_SPACE,
        seeds = [AUCTION_SEED, asset.key().as_ref()],
        bump,
    )]
    pub auction: Box<Account<'info, Auction>>,
    #[account(address = config.usdt_mint)]
    pub usdt_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    /// 存放 USDT 出價的代幣帳戶，屬於 Auction PDA
    #[account(
        init,
        payer = payer,
        associated_token::mint = usdt_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdt_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// 存放 USDC 出價的代幣帳戶，屬於 Auction PDA
    #[account(
        init,
        payer = payer,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdc_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗擁有者和集合
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    pub bidder: Signer<'info>,
    /// 付前一位出價者新代幣帳戶的租金
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(seeds = [AUCTION_CONFIG_SEED], bump = auction_config.bump)]
    pub auction_config: Account<'info, AuctionConfig>,
    #[account(mut, seeds = [AUCTION_SEED, auction.asset.as_ref()], bump = auction.bump)]
    pub auction: Box<Account<'info, Auction>>,
    /// 這口出價用的代幣：USDT 或 USDC
    #[account(constraint = accepted(&config, &bid_mint) @ MarketError::UnsupportedPaymentMint)]
    pub bid_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        token::mint = bid_mint,
        token::authority = bidder,
        token::token_program = token_program,
    )]
    pub bidder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = bid_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub bid_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// 前一口的幣種（沒有前一口時傳 bid_mint），在指令裡核對
    #[account(constraint = accepted(&config, &prev_mint) @ MarketError::UnsupportedPaymentMint)]
    pub prev_mint: Box<InterfaceAccount<'info, Mint>>,
    /// 存放前一口的代幣帳戶；和 bid_escrow 同幣種時是同一個帳戶
    #[account(
        mut,
        dup,
        associated_token::mint = prev_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub prev_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: 前一位最高出價者（沒有時是出價者自己），在指令裡核對
    pub prev_bidder: UncheckedAccount<'info>,
    /// 退款收款帳戶。前一位出價者關掉了代幣帳戶也照樣能退（這次建回來），沒人能用關帳戶擋住別人出價。
    /// 第一口出價時它就是出價者自己的帳戶，不會轉帳
    #[account(
        init_if_needed,
        dup,
        payer = payer,
        associated_token::mint = prev_mint,
        associated_token::authority = prev_bidder,
        associated_token::token_program = token_program,
    )]
    pub prev_bidder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    /// 呼叫者：付手續費、新建代幣帳戶的租金和 Core 轉移的費用
    #[account(mut)]
    pub cranker: Signer<'info>,
    /// CHECK: 必須是拍賣的賣家，收貨款
    #[account(address = auction.seller)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: 最高出價者；沒人出價時傳賣家
    #[account(
        constraint = high_bidder.key() == if auction.bid_count > 0 { auction.high_bidder } else { auction.seller } @ MarketError::WrongBidder
    )]
    pub high_bidder: UncheckedAccount<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = rent_payer, seeds = [AUCTION_SEED, asset.key().as_ref()], bump = auction.bump, has_one = asset, has_one = rent_payer)]
    pub auction: Box<Account<'info, Auction>>,
    /// CHECK: 必須是付拍賣租金的人，收回租金
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(address = config.usdt_mint)]
    pub usdt_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdt_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdc_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// 得標那口的幣種；沒人出價時傳 USDT
    #[account(
        constraint = win_mint.key() == if auction.bid_count > 0 { auction.high_bid_mint } else { config.usdt_mint } @ MarketError::WrongBidder
    )]
    pub win_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = cranker,
        associated_token::mint = win_mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// 流拍時的退款帳戶；沒人出價時就是賣家的帳戶，不會轉帳
    #[account(
        init_if_needed,
        dup,
        payer = cranker,
        associated_token::mint = win_mint,
        associated_token::authority = high_bidder,
        associated_token::token_program = token_program,
    )]
    pub high_bidder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: 必須是 Config 登記的收款錢包
    #[account(address = config.treasury)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = win_mint,
        associated_token::authority = treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelAuction<'info> {
    pub seller: Signer<'info>,
    /// 付 Core 轉移的費用
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, close = rent_payer, seeds = [AUCTION_SEED, asset.key().as_ref()], bump = auction.bump, has_one = seller, has_one = asset, has_one = rent_payer)]
    pub auction: Box<Account<'info, Auction>>,
    /// CHECK: 必須是付拍賣租金的人，收回租金
    #[account(mut)]
    pub rent_payer: UncheckedAccount<'info>,
    #[account(address = config.usdt_mint)]
    pub usdt_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdt_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdt_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub usdc_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MigrateListing<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: 舊版 Listing，在指令裡按舊格式解析
    #[account(mut, owner = crate::ID, seeds = [LISTING_SEED, asset.key().as_ref()], bump)]
    pub listing: UncheckedAccount<'info>,
    /// CHECK: 必須是舊版 Listing 記的賣家，在指令裡核對
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
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

#[derive(Accounts)]
pub struct MigrateAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ MarketError::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: 舊版 Auction，在指令裡按舊格式解析
    #[account(mut, owner = crate::ID, seeds = [AUCTION_SEED, asset.key().as_ref()], bump)]
    pub auction: UncheckedAccount<'info>,
    /// CHECK: 必須是舊版 Auction 記的賣家，在指令裡核對
    #[account(mut)]
    pub seller: UncheckedAccount<'info>,
    /// CHECK: 最高出價者；沒人出價時傳賣家，在指令裡核對
    pub high_bidder: UncheckedAccount<'info>,
    /// 舊版拍賣的結算代幣，在指令裡核對
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = auction,
        associated_token::token_program = token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = payment_mint,
        associated_token::authority = high_bidder,
        associated_token::token_program = token_program,
    )]
    pub high_bidder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Metaplex Core 資產，由 Core 程序校驗
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,
    /// CHECK: 地址必須是平台集合
    #[account(address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: 地址固定為 Metaplex Core
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct AuctionCreated {
    pub asset: Pubkey,
    pub seller: Pubkey,
    pub start_price: u64,
    pub reserve_price: u64,
    pub end_ts: i64,
}

#[event]
pub struct BidPlaced {
    pub asset: Pubkey,
    pub bidder: Pubkey,
    pub payment_mint: Pubkey,
    pub amount: u64,
    pub end_ts: i64,
}

#[event]
pub struct AuctionSettled {
    pub asset: Pubkey,
    pub seller: Pubkey,
    /// 流拍時為空
    pub winner: Option<Pubkey>,
    pub payment_mint: Option<Pubkey>,
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
    #[msg("不是舊版帳戶")]
    NotLegacy,
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

    #[test]
    fn legacy_lengths_differ_from_current() {
        assert_ne!(LEGACY_LISTING_LEN, 8 + Listing::INIT_SPACE);
        assert_ne!(LEGACY_AUCTION_LEN, 8 + Auction::INIT_SPACE);
    }
}
