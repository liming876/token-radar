// Token launch radar: the value model, the farm plans and the board builder.
//
// Everything in this file is derived from the sealed snapshot alone. No
// protocol name is hardcoded anywhere: the ranking falls out of each
// protocol's own TVL, its category's market multiple, its seven-day TVL
// momentum and how long it has been tracked with no token recorded.
//
// The model, in one paragraph. A protocol that records no token is a launch
// candidate unless it is a product of a token that already trades — a
// wrapped, staked, bridged or restaked product, a liquid-staking listing,
// or an exchange balance sheet: those are not
// waiting on a launch of their own, so they are classified, named and set
// aside with their reasons. Where one protocol appears under several
// version listings, the board ranks its largest listing and sets the rest
// aside, so no protocol is counted twice. Every remaining candidate is
// priced as
//
//   implied value = TVL x category multiple x growth factor x maturity factor
//
// where the category multiple is the median market-cap-to-TVL ratio of the
// snapshot's own already-trading protocols in that category (shrunk toward
// the snapshot-wide median when a category has few trading peers), the
// growth factor rewards or discounts the protocol's 7-day TVL change, and
// the maturity factor credits time a protocol has run, tracked, with no
// token. Where the snapshot reports no 7-day change or no tracking date,
// that factor is a neutral x1.00, never a guess. The product categories
// below are exactly the ones the snapshot's watchlist rule documents — no
// more: its watchlist itself keeps, for one, a stablecoin-wrapper listing,
// so that category is priced like any other, not set aside.

/** One protocol object, exactly as the snapshot carries it. */
export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot file. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

/** Thrown when the snapshot does not have the shape the radar reads. */
export class SnapshotError extends Error {}

/** Parse and lightly validate the snapshot text. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }
  const snap = raw as Partial<Snapshot>;
  if (typeof snap.as_of !== 'string' || !Array.isArray(snap.protocols) || !Array.isArray(snap.watchlist)) {
    throw new SnapshotError('snapshot is missing as_of, protocols or watchlist');
  }
  for (const p of snap.protocols as Protocol[]) {
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new SnapshotError('a protocol is missing slug, name or tvl_usd');
    }
  }
  return snap as Snapshot;
}

/** Whole days between two YYYY-MM-DD dates, or null when either is unusable. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** True when DefiLlama's record carries a token for the protocol. */
export function recordsToken(p: Protocol): boolean {
  return p.gecko_id !== null || p.symbol !== null;
}

/**
 * Categories whose listings are products of tokens that already trade, with
 * the reason each is set aside. A bridge listing is the bridged assets
 * themselves; a liquid-staking listing is the staked asset itself; a CEX
 * listing is an exchange's balance sheet. These are the same product
 * categories the snapshot's own watchlist rule documents, applied
 * board-wide so that two listings of the same kind are never judged by
 * different tests. (The watchlist keeps one stablecoin-wrapper listing,
 * so that category is not here: it is priced like any other.)
 */
const PRODUCT_CATEGORY_REASONS: Record<string, string> = {
  Bridge: 'a bridge product of assets whose tokens already trade',
  'Canonical Bridge': 'a bridge product of assets whose tokens already trade',
  CEX: 'an exchange balance sheet, not a protocol awaiting its own launch',
  'Liquid Staking': 'a liquid staking product: the listing is the staked asset itself, and the underlying token already trades',
  'Liquid Restaking': 'a liquid restaking product: a restaked position in assets whose tokens already trade',
  'Restaked BTC': 'a restaked bitcoin product, not a protocol awaiting a launch of its own',
};
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A protocol's family name: its name with any version marker stripped. */
export function familyKey(name: string): string {
  return name.replace(VERSION_SUFFIX, '');
}

/**
 * Why a tokenless protocol is still not a launch candidate, or null when it
 * is one. A wrapped or staked product trades its underlying's token already;
 * an exchange balance sheet is a company's books, not a protocol awaiting a
 * launch. Mirrors the reasoning the snapshot's own watchlist documents. A
 * version marker in a name is not a reason on its own: a lone V1 or V2
 * listing is the protocol itself, and duplicates are handled by ranking one
 * listing per family in buildBoard.
 */
export function productReason(p: Protocol): string | null {
  if (p.category !== null && PRODUCT_CATEGORY_REASONS[p.category] !== undefined) {
    return PRODUCT_CATEGORY_REASONS[p.category]!;
  }
  if (PRODUCT_WORD.test(p.name)) return 'a wrapped or staked product of a token that already trades';
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return 'an exchange-branded product of a token that already trades';
  return null;
}

export type ProtocolClass = 'live' | 'product' | 'pre';

export function classify(p: Protocol): ProtocolClass {
  if (recordsToken(p)) return 'live';
  return productReason(p) === null ? 'pre' : 'product';
}

/** The model's constants, stated once so the page can print them verbatim. */
export const MODEL = {
  version: 'radar-model-2',
  /** mcap/TVL multiples are clamped to this band before use. */
  multipleFloor: 0.02,
  multipleCap: 2.5,
  /**
   * Weight of the snapshot-wide median when a category has few trading
   * peers, counted in peers: a category needs about this many trading peers
   * before its own median outweighs the snapshot's. At 8, one high peer
   * (an oracle network at x2.97 was the only Risk Curators peer) moves its
   * category's multiple far less than the board's top ranks deserve.
   */
  shrinkPeers: 8,
  /** Trading peers with a ratio outside this band are ignored as bad records. */
  ratioBand: 50,
  /** Seven-day change is clamped to this band, in per cent, before use. */
  growthClampLow: -60,
  growthClampHigh: 200,
  /** Growth factor = 1 + growthWeight x clamped change / 100. */
  growthWeight: 0.3,
  /** Maturity factor reaches 1 + maturityWeight after maturityYears years. */
  maturityWeight: 0.3,
  maturityYears: 4,
  /** The board ranks pre-token protocols at or above this TVL (the snapshot's own inclusion floor). */
  boardFloorUsd: 5_000_000,
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** What the market's own pricing says about one category. */
export interface CategoryStat {
  /** The multiple in use, after shrinkage and clamping. */
  multiple: number;
  /** How many of the snapshot's trading protocols priced this category. */
  peers: number;
}

/** Category multiples and peer counts, plus the snapshot-wide median. */
export interface CategoryStats {
  byCategory: Map<string, CategoryStat>;
  global: number;
}

/** Median market-cap-to-TVL per category, from the snapshot's trading protocols. */
export function categoryStats(snapshot: Snapshot): CategoryStats {
  const ratios = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (!recordsToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (ratio <= 0 || ratio >= MODEL.ratioBand) continue;
    all.push(ratio);
    const key = p.category ?? '(uncategorised)';
    const list = ratios.get(key);
    if (list === undefined) ratios.set(key, [ratio]);
    else list.push(ratio);
  }
  const globalMedian = median(all);
  const byCategory = new Map<string, CategoryStat>();
  for (const [key, list] of ratios) {
    const shrunk = (list.length * median(list) + MODEL.shrinkPeers * globalMedian) / (list.length + MODEL.shrinkPeers);
    byCategory.set(key, {
      multiple: Math.min(MODEL.multipleCap, Math.max(MODEL.multipleFloor, shrunk)),
      peers: list.length,
    });
  }
  return { byCategory, global: globalMedian };
}

/** The multiple and peer count one protocol is priced with. */
export function statFor(p: Protocol, stats: CategoryStats): CategoryStat {
  return stats.byCategory.get(p.category ?? '(uncategorised)') ?? { multiple: stats.global, peers: 0 };
}

/** The pieces of one protocol's implied value, kept apart so the page can show them. */
export interface ValueBreakdown {
  impliedUsd: number;
  multiple: number;
  growthFactor: number;
  maturityFactor: number;
  ageDays: number | null;
}

export function impliedValue(p: Protocol, asOf: string, stats: CategoryStats): ValueBreakdown {
  const multiple = statFor(p, stats).multiple;
  let growthFactor = 1;
  if (p.change_7d !== null) {
    const clamped = Math.min(MODEL.growthClampHigh, Math.max(MODEL.growthClampLow, p.change_7d));
    growthFactor = 1 + (MODEL.growthWeight * clamped) / 100;
  }
  const ageDays = p.listed_at === null ? null : daysBetween(p.listed_at, asOf);
  let maturityFactor = 1;
  if (ageDays !== null && ageDays > 0) {
    maturityFactor = 1 + MODEL.maturityWeight * Math.min(ageDays / 365, MODEL.maturityYears) / MODEL.maturityYears;
  }
  const impliedUsd = Math.max(1, Math.round(p.tvl_usd * multiple * growthFactor * maturityFactor));
  return { impliedUsd, multiple, growthFactor, maturityFactor, ageDays };
}

/** A short, data-derived note on why this protocol sits where it sits. */
export function signal(p: Protocol, v: ValueBreakdown, onWatchlist: boolean): string {
  const notes: string[] = [];
  if (onWatchlist) notes.push('on the house watchlist');
  if (p.change_7d !== null && p.change_7d > MODEL.growthClampHigh) {
    notes.push(`TVL up ${p.change_7d.toFixed(1)}% in 7 days, capped at +${MODEL.growthClampHigh}% in the model`);
  } else if (p.change_7d !== null && p.change_7d >= 15) {
    notes.push(`TVL up ${p.change_7d.toFixed(1)}% in 7 days`);
  } else if (p.change_7d !== null && p.change_7d < MODEL.growthClampLow) {
    notes.push(`TVL down ${Math.abs(p.change_7d).toFixed(1)}% in 7 days, floored at ${MODEL.growthClampLow}% in the model`);
  } else if (p.change_7d !== null && p.change_7d <= -25) {
    notes.push(`TVL down ${Math.abs(p.change_7d).toFixed(1)}% in 7 days, priced in`);
  }
  if (v.ageDays !== null && v.ageDays >= 730) notes.push(`${(v.ageDays / 365).toFixed(1)} years tracked with no token recorded`);
  if (p.chains.length >= 8) notes.push(`live on ${p.chains.length} chains`);
  if (notes.length === 0) notes.push('mid-pack on size, momentum and track record');
  return notes.slice(0, 2).join('; ');
}

/** Typical all-in gas for a first deposit or swap, by the chain it happens on. */
const CHAIN_GAS: Record<string, string> = {
  Ethereum: '$6-25',
  Solana: '$0.02-0.10',
  Base: '$0.05-0.30',
  Arbitrum: '$0.10-0.50',
  Optimism: '$0.10-0.50',
  BSC: '$0.10-0.40',
  Polygon: '$0.02-0.10',
  Binance: '$0.10-0.40',
  Avalanche: '$0.10-0.50',
  Linea: '$0.05-0.30',
  Scroll: '$0.05-0.30',
  Mantle: '$0.05-0.30',
  Tron: '$0.50-2',
  Bitcoin: '$1-8',
};

function gasFor(chain: string): string {
  return CHAIN_GAS[chain] ?? '$0.10-1.00';
}

/** The low end of a chain's typical gas, parsed from the table above. */
function gasLow(chain: string): number {
  const m = /^\$([0-9.]+)/.exec(gasFor(chain));
  return m === null ? 0.1 : Number(m[1]);
}

/**
 * The chain to start farming on: the first of the protocol's chains in the
 * snapshot's own order, which lists a protocol's chains by where its TVL
 * sits — its main chain, where its flagship markets and vaults live.
 */
export function homeChain(p: Protocol): string {
  return p.chains[0] ?? 'Ethereum';
}

/** The cheapest of the protocol's chains to transact on, for the setup step's aside. */
export function cheapestChain(p: Protocol): string {
  let best = p.chains[0] ?? 'Ethereum';
  let bestCost = gasLow(best);
  for (const chain of p.chains.slice(1)) {
    const cost = gasLow(chain);
    if (cost < bestCost) {
      best = chain;
      bestCost = cost;
    }
  }
  return best;
}

/** A sensible learning position, scaled to the protocol's size. */
function positionFor(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return '$1,000-10,000';
  if (tvlUsd >= 100_000_000) return '$250-2,500';
  if (tvlUsd >= 10_000_000) return '$100-1,000';
  return '$25-250';
}

/** A small stable hash of a slug, so plan variants rotate deterministically. */
function slugHash(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i += 1) h = ((h * 33) ^ slug.charCodeAt(i)) >>> 0;
  return h;
}

/** The core on-protocol actions for a category: two step templates each. */
const PLAYBOOKS: Record<string, [string, string]> = {
  Lending: [
    'Supply {pos} of a major asset (USDC, USDT or ETH) into {name}\'s main market on {chain} and leave it supplied; lenders with balances held over time are the users a launch snapshot can see. Cost: the setup gas above plus no fee to supply. Time: about 10 minutes.',
    'Borrow a small amount, at most 30% of what your collateral allows, and repay it after a week so the protocol records a full lend-and-borrow cycle, not just a deposit. Cost: interest for the week, usually under $5 at this size. Time: two visits of 5 minutes.',
  ],
  Dexs: [
    'Make 2-3 swaps a week on {name} ({chain}), $50-200 each way between pairs you would trade anyway, so your volume builds steadily instead of in one burst. Cost: swap fees of roughly 0.05-0.3% per trade plus gas. Time: 5 minutes a session.',
    'Add {pos} of liquidity to a busy pair on {name} and keep it in range for at least a month; liquidity held through quiet weeks is what separates a farmer from a passer-by. Cost: gas to add and remove, plus impermanent-loss risk on the pair. Time: 15 minutes to set up.',
  ],
  Yield: [
    'Deposit {pos} into {name}\'s flagship vault on {chain} and hold the position for at least 6-8 weeks; vault share balances over time are the record a points or token snapshot reads. Cost: deposit gas only, the vault takes its fee from yield. Time: 10 minutes.',
    'Restake or roll the vault shares where {name} offers a boosted or locked tier, choosing the lock you can actually sit out; longer committed positions usually count for more than larger idle ones. Cost: one extra transaction of gas. Time: 5 minutes.',
  ],
  'Yield Aggregator': [
    'Split {pos} across two of {name}\'s vaults on {chain} rather than chasing the highest APY into one, and rebalance only when a vault closes. Cost: two lots of deposit gas. Time: 15 minutes.',
    'Claim and re-deposit rewards monthly so the account shows a full season of compounding, not a single deposit. Cost: small gas each claim. Time: 5 minutes a month.',
  ],
  Derivatives: [
    'Open small perpetual positions on {name} ({chain}) twice a week, $50-200 of margin with low leverage, and close them the same day; regular trading days count more than one large trade. Cost: trading fees around 0.05% a side plus funding. Time: 10 minutes a session.',
    'Keep a modest margin balance parked on {name} between sessions so the account reads as a standing user, not a drive-by. Cost: opportunity cost of the parked margin only. Time: no extra visits.',
  ],
  CDP: [
    'Open a vault on {name} ({chain}) with {pos} of collateral and mint a conservative amount of its stablecoin, keeping the collateral ratio well above liquidation. Cost: vault-opening gas plus a small stability fee over time. Time: 15 minutes.',
    'Hold or use the minted stablecoin inside the ecosystem (a savings rate or a partner pool) for a full month so both sides of the position are on record. Cost: one or two transactions of gas. Time: 5 minutes.',
  ],
  RWA: [
    'Complete {name}\'s onboarding and KYC early, before any allocation window opens; for real-world-asset protocols the verified account, not the deposit size, is usually the scarce credential. Cost: $0, documents only. Time: about 20 minutes.',
    'Invest {pos} in the shortest-duration offering on {name} and hold it to maturity rather than trading out, so the account shows a completed cycle. Cost: subscription fees as listed, typically under 1%. Time: 10 minutes plus the holding period.',
  ],
  'Risk Curators': [
    'Supply {pos} through a vault that {name} curates on its host lending market ({chain}), picking the curator\'s flagship vault rather than a side one; curated-vault depositors are the audience a curator token would reward. Cost: deposit gas only. Time: 10 minutes.',
    'Keep the deposit in place for a full quarter and add a small top-up monthly; curators read depositor tenure from the vault\'s own records. Cost: small gas per top-up. Time: 5 minutes a month.',
  ],
  'Onchain Capital Allocator': [
    'Deposit {pos} into {name}\'s flagship vault on {chain} and hold the shares for at least a quarter; allocator vaults that formalise a token snapshot long-held share balances, not deposit totals. Cost: deposit gas only. Time: 10 minutes.',
    'Read {name}\'s strategy and rebalancing reports monthly and keep a small recurring top-up going; allocators can see which depositors stayed through a full strategy cycle, drawdowns included. Cost: small gas per top-up. Time: 15 minutes a month.',
  ],
  'Basis Trading': [
    'Allocate {pos} to {name}\'s basis vault on {chain} and hold through at least one full funding cycle (about a month); basis strategies reward capital that stays through flat weeks. Cost: deposit gas, strategy fees come out of yield. Time: 10 minutes.',
    'Add a second, smaller deposit a month later so the account shows recurring commitment rather than a single opportunistic entry. Cost: one more lot of deposit gas. Time: 5 minutes.',
  ],
  'Prediction Market': [
    'Trade small positions, $10-50 a market, on 2-3 markets a week on {name}, favouring markets you actually have a view on; consistent makers and takers across many markets are the accounts a launch remembers. Cost: the stake itself is at risk, fees are minimal. Time: 10 minutes a session.',
    'Hold at least one position to settlement each month so your record includes resolved outcomes, not only open trades. Cost: none beyond the stake already placed. Time: no extra visits.',
  ],
  Chain: [
    'Bridge a small amount, $50-200, to {name}\'s chain and make it your home for a few transactions a week: swaps, a name or domain mint, one NFT; chains reward wallets with a long, ordinary history. Cost: bridge fee plus cheap local gas. Time: 15 minutes to set up.',
    'Use two or three of the chain\'s flagship apps that {name} itself promotes, so your activity sits in the ecosystem a token launch would snapshot. Cost: a few dollars of gas in total. Time: 20 minutes a week.',
  ],
  Indexes: [
    'Buy {pos} of {name}\'s headline index on {chain} and hold it for a full quarter; index holders are the natural recipients when an index protocol tokenises. Cost: minting gas plus the index\'s embedded fee. Time: 10 minutes.',
    'Set a small monthly top-up, even $25, so the account shows a savings pattern rather than a single speculative buy. Cost: small gas each month. Time: 5 minutes a month.',
  ],
  Launchpad: [
    'Register on {name} and complete one small participation, {pos} at most, in a live sale rather than only watching; completed allocations, even tiny ones, put the account in the launch history. Cost: the allocation itself, only risk what you can lose. Time: 20 minutes.',
    'Claim and hold whatever the sale distributes for at least a month instead of selling on day one; launchpads favour accounts that stay in their ecosystem. Cost: claim gas. Time: 5 minutes.',
  ],
  'Liquidity Manager': [
    'Deposit {pos} into a managed range position on {name} ({chain}) rather than setting your own ticks; the manager\'s rebalancing record is what a launch would reward. Cost: deposit gas, the management fee comes out of fees earned. Time: 15 minutes.',
    'Check the position monthly and top up after a rebalance instead of withdrawing; managed positions held across several ranges read as committed liquidity. Cost: small gas per top-up. Time: 5 minutes a month.',
  ],
  'Staking Pool': [
    'Delegate {pos} to a validator in {name}\'s pool on {chain}, spreading across two validators if the pool allows it; delegation age is the record staking pools snapshot. Cost: delegation transaction fees only. Time: 10 minutes.',
    'Claim and re-stake rewards monthly so the delegation compounds visibly instead of sitting idle. Cost: small fees per claim. Time: 5 minutes a month.',
  ],
  Restaking: [
    'Restake {pos} through {name} on {chain} and keep the position for a full quarter; restaking protocols reward capital that stays through quiet, slashing-risk periods, not deposits that leave at the first points tally. Cost: deposit gas. Time: 10 minutes.',
    'Spread a second, smaller restake across another operator or strategy {name} supports, so the account shows deliberate allocation rather than a single click. Cost: one more lot of gas. Time: 5 minutes.',
  ],
  'Leveraged Farming': [
    'Open a small leveraged position on {name} ({chain}) at no more than 2-3x on a pair you understand, and set the liquidation alerts before you walk away. Cost: borrow interest while the position is open, plus gas. Time: 20 minutes to set up carefully.',
    'Close and reopen positions on a monthly rhythm rather than leaving one maxed-out position to chance; a record of managed cycles is worth more than one lucky hold. Cost: gas per cycle. Time: 10 minutes a month.',
  ],
  'Dual-Token Stablecoin': [
    'Mint {pos} of {name}\'s stablecoin side on {chain} and hold both parts of the pair as the design intends; dual-token systems snapshot the holders of each leg separately. Cost: minting gas plus any stability fee. Time: 15 minutes.',
    'Use the stablecoin leg in one partner pool for a full month so both legs of the position appear in records. Cost: one or two transactions of gas. Time: 5 minutes.',
  ],
  'Uncollateralized Lending': [
    'Apply to lend through {name} and fund one small pool, {pos} at most; undercollateralised lending is credit, so start with the pool whose borrowers and terms you can actually read. Cost: the capital is genuinely at risk of default. Time: 30 minutes of reading, 10 to fund.',
    'Follow the pool\'s repayment reports monthly, and lend again only after a full repaid cycle is on record. Cost: $0 to monitor. Time: 10 minutes a month.',
  ],
  'Cross Chain Bridge': [
    'Bridge $100-500 through {name} in both directions over a month, using routes you genuinely need; bridge protocols remember repeat route users, not one test transfer. Cost: bridge fees, usually well under 1%, plus gas. Time: 10 minutes a trip.',
    'Keep a small balance working on the far side of your most-used route (a swap or a deposit there) so the account reads as a cross-chain user, not a passer-by. Cost: gas on the destination chain. Time: 10 minutes.',
  ],
  Payments: [
    'Use {name} for real transfers: route two or three payments a month through it, even small ones, always from the wallet you keep. Cost: network fees per transfer, minimal on this network. Time: 5 minutes a payment.',
    'Receive at least one payment as well as sending, so the account shows both sides of the network\'s flow. Cost: $0 beyond the transfer itself. Time: no extra visits.',
  ],
  Insurance: [
    'Buy one small policy through {name}, {pos} at most of cover on a protocol you actually use; policyholders are the users an insurance protocol\'s token would be built around. Cost: the premium, typically a few per cent of cover per year. Time: 15 minutes.',
    'Let the policy run its full term and renew once if you still hold the underlying position; a completed cover period is a cleaner record than a cancelled one. Cost: the renewal premium. Time: 5 minutes.',
  ],
  CeDeFi: [
    'Deposit {pos} through {name}\'s main product on {chain} and complete its account verification early; hybrid platforms gate their best rates, and any future rewards, behind verified accounts. Cost: deposit gas, verification is free. Time: 20 minutes.',
    'Keep the position for a full quarter and use one second feature (a swap, a card, a savings pocket) so the account shows breadth, not a single deposit. Cost: small fees as listed. Time: 10 minutes.',
  ],
  Farm: [
    'Join {name}\'s current campaign on {chain} with {pos} and complete the campaign\'s stated tasks in order; a pre-launch farm is quite literally the list a launch distributes to. Cost: task gas, a few dollars in total. Time: 30 minutes to set up.',
    'Return weekly to renew or extend the farm position until the campaign closes; campaigns tally consistency across their whole window, not the final week. Cost: small gas weekly. Time: 5 minutes a week.',
  ],
  'Collateral Markets': [
    'Supply {pos} of collateral through {name} on {chain} and leave it supplied for a full quarter; collateral suppliers are the base a collateral protocol\'s token would reward. Cost: supply gas only. Time: 10 minutes.',
    'Enable one additional collateral type or strategy {name} offers, in a small size, so the account shows it uses the market\'s range. Cost: one more transaction of gas. Time: 5 minutes.',
  ],
  'CDP Manager': [
    'Connect the wallet that holds your CDP or vault positions to {name} and run one automation (a protection or boost rule) on a real position; manager tools count wallets with live automations, not visitors. Cost: setup gas, automation fees only when a rule fires. Time: 20 minutes.',
    'Keep at least one automation live for a full quarter and review its triggers monthly as markets move. Cost: $0 unless a rule fires. Time: 10 minutes a month.',
  ],
  'OTC Marketplace': [
    'Register and verify on {name}, then complete one small trade, {pos} at most, rather than only browsing quotes; completed counterparties are the accounts a marketplace launch can credit. Cost: the trade spread, shown before you confirm. Time: 30 minutes including verification.',
    'Quote or trade once a month in a small size so the account shows a standing trading relationship. Cost: the spread per trade. Time: 10 minutes a month.',
  ],
  'Governance Incentives': [
    'Take part in {name}\'s current incentive round on {chain}: complete the action it pays for with {pos} at stake and keep the position until the round closes. Cost: gas for the qualifying action. Time: 15 minutes.',
    'Vote in any governance poll the round opens to participants, even with a small weight; voters are the cheapest members for a future token to keep. Cost: $0, or one vote transaction of gas. Time: 5 minutes per poll.',
  ],
  'Crypto Card Issuer': [
    'Order {name}\'s card and complete verification early; card programs that tokenise reward verified, activated cardholders first. Cost: verification is free, card fees as listed. Time: 20 minutes.',
    'Put ordinary spending on the card weekly, even small amounts, for a full quarter; the transaction history, not the balance, is the activity record. Cost: your own spending only. Time: no extra visits.',
  ],
  'Interest Rate Derivatives': [
    'Trade one small rate position on {name} ({chain}), fixing or hedging a rate on a size you understand, {pos} at most; rate markets remember accounts that complete a full contract cycle. Cost: trading fee plus gas. Time: 20 minutes the first time.',
    'Hold one position to expiry rather than closing early, so the record includes a settled contract. Cost: none beyond the first trade. Time: no extra visits.',
  ],
  'Anchor BTC': [
    'Deposit a small amount of BTC, $100-500 worth, through {name}\'s app and hold the resulting position for a full quarter; bitcoin-anchored protocols snapshot deposits that stay through quiet markets. Cost: bitcoin network fees, $1-8 a transfer. Time: 15 minutes.',
    'Make one second deposit a month later so the account shows recurring use rather than a single test. Cost: one more network fee. Time: 5 minutes.',
  ],
  'Decentralized BTC': [
    'Bridge $100-500 of BTC into {name} on {chain} and put it to work in its main pool or vault; bitcoin protocols are farmed by balances that stay bridged, not by test transfers. Cost: bitcoin network fee plus destination gas. Time: 20 minutes.',
    'Keep the bridged balance in place for a full quarter and claim any rewards monthly. Cost: small gas per claim. Time: 5 minutes a month.',
  ],
  'Stablecoin Wrapper': [
    'Wrap {pos} of the underlying stablecoin into {name}\'s wrapped form on {chain} and hold the wrapped balance instead of unwrapping at once; a wrapper contract\'s own record is the balances of the wrapped token, so time spent holding it is what counts. Cost: wrap gas only. Time: 10 minutes.',
    'Use the wrapped stablecoin somewhere it is accepted — a payment, a pool or a partner app {name} lists — at least once a month, so the account shows the wrapper in circulation, not parked after a single wrap. Cost: ordinary transaction gas per use. Time: 5 minutes a month.',
  ],
  'Options Vault': [
    'Deposit {pos} into {name}\'s live options vault on {chain} before its weekly epoch starts and leave the deposit in for the whole epoch; options vaults settle strategy by strategy, and one completed epoch is the smallest unit of real use. Cost: deposit gas; the premium the strategy earns or loses is the position\'s own risk. Time: 10 minutes.',
    'Roll the deposit into the next epoch rather than withdrawing after one, and stay for at least a quarter of epochs; share balances held across many settlements are what a launch snapshot can see. Cost: gas only when you top up or exit. Time: 5 minutes a week to check.',
  ],
  Privacy: [
    'Make one small deposit, {pos} at most, into {name}\'s pool on {chain} from the wallet you will keep, and store the deposit note exactly as the app instructs — without it the funds cannot be withdrawn, and the deposit itself is the usage record. Cost: deposit gas. Time: 15 minutes, mostly reading.',
    'Use the pool as it is built to be used over a season: a withdrawal or a fresh deposit every month or so, and where {name} offers an association set or another compliance tool, use it; steady, provable use is what separates a user from a one-off test. Cost: gas per transaction. Time: 10 minutes a month.',
  ],
};

const GENERIC_PLAYBOOK: [string, string] = [
  'Use {name}\'s core product on {chain} with {pos} at stake: make the deposit, trade or position its front page is built around, and complete one full cycle rather than a single click. Cost: the setup gas above. Time: about 15 minutes.',
  'Put the position to work a second way: use whatever {name} issues or enables — its receipt token, its route, its cover — in one partner app or pool for a full month, so the account shows the whole loop and not just an entry. Cost: one or two transactions of gas. Time: 10 minutes.',
];

/** How a protocol is farmed over a season differs by what kind of thing it is. */
type CadenceKind = 'trading' | 'capital' | 'stake' | 'access';
const CADENCE_KIND: Record<string, CadenceKind> = {
  Dexs: 'trading', Derivatives: 'trading', 'Prediction Market': 'trading',
  'Interest Rate Derivatives': 'trading', 'OTC Marketplace': 'trading',
  'Staking Pool': 'stake', Restaking: 'stake', 'Anchor BTC': 'stake', 'Decentralized BTC': 'stake',
  RWA: 'access', Insurance: 'access', Payments: 'access', 'Crypto Card Issuer': 'access',
  'Governance Incentives': 'access', 'Uncollateralized Lending': 'access', Chain: 'access',
  Launchpad: 'access', Indexes: 'access', 'Cross Chain Bridge': 'access', Privacy: 'access',
  'Stablecoin Wrapper': 'capital', 'Options Vault': 'capital',
};

/** The season-cadence step: two wordings per kind, rotated by slug. */
const CADENCE: Record<CadenceKind, [string, string]> = {
  trading: [
    'Trade from the same wallet on a steady rhythm, two or three sessions a week for 6-10 weeks, in sizes you would trade anyway; volume spread over many days is what launch snapshots count, not one big day. Cost: normal trading fees only. Time: 10 minutes a session.',
    'Keep a weekly cadence for 6-10 weeks: one or two small sessions on {name} each week, never a last-minute burst in the final days; distribution snapshots are usually taken without warning and reward tenure over size. Cost: normal trading fees only. Time: 10 minutes a week.',
  ],
  capital: [
    'Keep a weekly cadence for 6-10 weeks: one small repeat action on {name} each week from the same wallet — a top-up, a claim or a rebalance — and never a last-minute burst; distribution snapshots are usually taken without warning and reward tenure over size. Cost: a few dollars of gas a week at most. Time: 5 minutes a week.',
    'Review the position monthly for a full quarter: top up a little when you can, claim what accrues, and leave the core position untouched; a season of ordinary, boring use is the record launch snapshots are built from. Cost: small gas monthly. Time: 10 minutes a month.',
  ],
  stake: [
    'Check the position monthly for a full quarter and re-stake whatever rewards arrive; staking records reward delegations that compound quietly, not ones that hop between pools. Cost: small fees monthly. Time: 5 minutes a month.',
    'Keep the stake in place for a full quarter without undelegating, and add one small top-up midway; tenure is the whole signal in staking, and exits reset it. Cost: one more transaction of fees. Time: 5 minutes.',
  ],
  access: [
    'Use {name} once a month for a full quarter in the ordinary way it is meant to be used — the transfer, cover, vote or trade it exists for — so the account builds a season of unremarkable, real use. Cost: the product\'s ordinary fees only. Time: 10 minutes a month.',
    'Keep a monthly cadence for a full quarter: one genuine use of {name} each month from the same account, diarised so it actually happens; consistency across a season is what separates users from tourists in any launch tally. Cost: ordinary fees only. Time: 10 minutes a month.',
  ],
};

/** The closing step: four ways to watch for the launch, rotated by slug. */
const WATCH_STEPS: [string, string, string, string] = [
  'Watch {name}\'s official channels for a points program, a governance forum or a token announcement, and diarise a monthly review of the position; cap your exposure at what you can afford to lose to smart-contract risk, which no ranking here prices in. Cost: $0. Time: 15 minutes a month.',
  'Keep your own records as you go — dates, amounts, transaction hashes — in one note for {name}; if a launch ever opens a claim, the wallets that can show a season of use are the ones that get through it. Cost: $0. Time: 5 minutes after each session.',
  'Set your exit rules for {name} now, while nothing is at stake emotionally: a position-size cap, a date to reassess, and the news (a hack, a team exit, a terms change) that would make you withdraw regardless of any token. Cost: $0. Time: 15 minutes once.',
  'Follow {name}\'s governance and developer channels, not just its marketing feed: a forum, a voting page or a testnet usually appears months before any token, and early participants in those are easy to be and hard to fake later. Cost: $0. Time: 15 minutes a month.',
];

/**
 * Five concrete steps to farm one protocol: set up on its main chain (with
 * its cheapest chain named when that differs), do the two things its
 * category is farmed by, keep the cadence its kind of protocol rewards,
 * then watch for the launch in one of four ways. Every step names a cost
 * and a time, because a plan without either is a slogan.
 * The variants rotate on a hash of the slug, so the plan is a pure function
 * of the snapshot and two runs agree byte for byte.
 */
export function farmSteps(p: Protocol): string[] {
  const chain = homeChain(p);
  const cheap = cheapestChain(p);
  const cheapNote = cheap !== chain && gasLow(cheap) < gasLow(chain)
    ? ` It also runs on ${cheap}, its cheapest chain to transact on, if gas matters more than starting on its main chain.`
    : '';
  const hash = slugHash(p.slug);
  const fill = (s: string): string =>
    s.replaceAll('{name}', p.name).replaceAll('{chain}', chain).replaceAll('{pos}', positionFor(p.tvl_usd));
  let setup: string;
  if (chain === 'Solana') {
    setup = `Set up a Solana wallet if you do not keep one, fund it with a little SOL for fees, and open ${p.name}; keep using that one wallet for this protocol, because a single consistent wallet is what any future snapshot can credit. Cost: ${gasFor(chain)} per transaction, plus a small rent deposit on new accounts. Time: about 15 minutes.`;
  } else if (chain === 'Bitcoin') {
    setup = `Open ${p.name} and connect the Bitcoin wallet you will keep using for it; there is no gas token to buy first, just network fees per transaction, and one consistent wallet is what any future snapshot can credit. Cost: $1-8 of network fees to make the first deposit. Time: about 15 minutes.`;
  } else {
    setup = `Open ${p.name} on ${chain} and connect one wallet you will keep using for this protocol; a single consistent wallet is what any future snapshot can credit.${cheapNote} Cost: ${gasFor(chain)} of gas to set up. Time: about 10 minutes.`;
  }
  const [coreA, coreB] = PLAYBOOKS[p.category ?? ''] ?? GENERIC_PLAYBOOK;
  const kind = CADENCE_KIND[p.category ?? ''] ?? 'capital';
  const cadence = CADENCE[kind][hash % 2]!;
  const watch = WATCH_STEPS[hash % 4]!;
  return [setup, fill(coreA), fill(coreB), fill(cadence), fill(watch)];
}

/** One board row, in the gate's shape. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
}

/** One dashboard row: the board row plus everything the page shows. */
export interface DashRow extends BoardRow {
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  multiple: number;
  /** Trading protocols in the snapshot that priced this row's category. */
  peers: number;
  growth_factor: number;
  maturity_factor: number;
  signal: string;
}

/** A trading protocol, shown on the page's already-live strip, never ranked. */
export interface LiveRow {
  name: string;
  symbol: string | null;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number | null;
}

/** One category's market anchor, for the page's multiples table. */
export interface MultipleRow {
  category: string;
  peers: number;
  multiple: number;
}

/** Everything data.js carries for the page. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  /** The snapshot-wide median mcap/TVL, the fallback multiple. */
  global_multiple: number;
  counts: { protocols: number; live: number; products: number; ranked: number; watchlist: number };
  rows: DashRow[];
  multiples: MultipleRow[];
  live: LiveRow[];
  excluded: { name: string; category: string | null; tvl_usd: number; reason: string }[];
}

export interface BuiltBoard {
  board: BoardRow[];
  data: RadarData;
}

/** Build the ranked board and the dashboard payload from one snapshot. */
export function buildBoard(snapshot: Snapshot): BuiltBoard {
  const stats = categoryStats(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const contenders: Protocol[] = [];
  const live: LiveRow[] = [];
  const excluded: RadarData['excluded'] = [];
  let liveCount = 0;
  for (const p of snapshot.protocols) {
    const cls = classify(p);
    if (cls === 'live') {
      liveCount += 1;
      live.push({ name: p.name, symbol: p.symbol, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd });
    } else if (cls === 'product') {
      excluded.push({ name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason: productReason(p)! });
    } else {
      contenders.push(p);
    }
  }
  // One listing per protocol family: where a protocol appears under several
  // version listings, rank its largest and set the others aside, so the
  // same protocol is never counted twice on the board.
  const families = new Map<string, Protocol[]>();
  for (const p of contenders) {
    const key = familyKey(p.name);
    const list = families.get(key);
    if (list === undefined) families.set(key, [p]);
    else list.push(p);
  }
  const candidates: { p: Protocol; v: ValueBreakdown }[] = [];
  for (const list of families.values()) {
    const ranked = [...list].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    const kept = ranked[0]!;
    for (const extra of ranked.slice(1)) {
      excluded.push({
        name: extra.name,
        category: extra.category,
        tvl_usd: extra.tvl_usd,
        reason: `another listing of the same protocol as ${kept.name}, which the board ranks; one listing per protocol`,
      });
    }
    if (kept.tvl_usd >= MODEL.boardFloorUsd) {
      candidates.push({ p: kept, v: impliedValue(kept, snapshot.as_of, stats) });
    }
  }
  candidates.sort((a, b) =>
    b.v.impliedUsd - a.v.impliedUsd || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  const rows: DashRow[] = candidates.map(({ p, v }, i) => {
    const steps = farmSteps(p);
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      implied_value_usd: v.impliedUsd,
      farm_steps: steps,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: v.ageDays,
      watchlist: watchlist.has(p.slug),
      multiple: Math.round(v.multiple * 1000) / 1000,
      peers: statFor(p, stats).peers,
      growth_factor: Math.round(v.growthFactor * 1000) / 1000,
      maturity_factor: Math.round(v.maturityFactor * 1000) / 1000,
      signal: signal(p, v, watchlist.has(p.slug)),
    };
  });
  // The market anchors behind the board, one row per ranked category.
  const multipleRows = new Map<string, MultipleRow>();
  for (const r of rows) {
    const key = r.category ?? 'Uncategorised';
    if (!multipleRows.has(key)) {
      multipleRows.set(key, { category: key, peers: r.peers, multiple: r.multiple });
    }
  }
  const multiples = [...multipleRows.values()].sort(
    (a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0),
  );
  live.sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd);
  excluded.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const board: BoardRow[] = rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    rank: r.rank,
    implied_value_usd: r.implied_value_usd,
    farm_steps: r.farm_steps,
  }));
  return {
    board,
    data: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model_version: MODEL.version,
      global_multiple: Math.round(stats.global * 1000) / 1000,
      counts: {
        protocols: snapshot.protocols.length,
        live: liveCount,
        products: excluded.length,
        ranked: rows.length,
        watchlist: snapshot.watchlist.length,
      },
      rows,
      multiples,
      live: live.slice(0, 24),
      excluded,
    },
  };
}

/** The data.js the dashboard reads: the whole payload on one window global. */
export function dataScript(data: RadarData): string {
  return `window.RADAR = ${JSON.stringify(data)};\n`;
}

/**
 * Self-check the board against the gate's published shape, so a bad board
 * fails here with a sentence instead of failing sealed on the server.
 * Returns the first problem, or null when the board is in shape.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows, outside 100 to 4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  let previous = Number.POSITIVE_INFINITY;
  for (let i = 0; i < board.length; i += 1) {
    const row = board[i]!;
    if (!known.has(row.slug)) return `row ${i + 1} names ${row.slug}, which the snapshot does not list`;
    if (seen.has(row.slug)) return `${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== i + 1) return `row ${i + 1} carries rank ${row.rank}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has a bad implied value`;
    if (row.implied_value_usd > previous) return `implied value rises at rank ${row.rank}`;
    previous = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) return `${row.slug} has a farm step of ${len} characters`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist protocol ${slug} is missing from the board`;
  }
  return null;
}
