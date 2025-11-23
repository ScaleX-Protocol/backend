export interface BroadcastFns {
	pushTrade: (symbol: string, tradeId: number, price: string, qty: string, buyerMaker: boolean, ts: number) => void;
	pushDepth: (symbol: string, bids: [string, string][], asks: [string, string][]) => void;
	pushKline: (symbol: string, interval: string, k: any) => void;
	pushMiniTicker: (symbol: string, c: string, h: string, l: string, v: string) => void;
	pushExecutionReport: (userId: string, rpt: any) => void;
	pushBalanceUpdate: (userId: string, bal: any) => void;
}

const noop = () => {};
let impl: BroadcastFns = {
	pushTrade: noop,
	pushDepth: noop,
	pushKline: noop,
	pushMiniTicker: noop,
	pushExecutionReport: noop,
	pushBalanceUpdate: noop,
};

export const pushTrade = (...args: Parameters<BroadcastFns["pushTrade"]>) => impl.pushTrade(...args);
export const pushDepth = (...args: Parameters<BroadcastFns["pushDepth"]>) => impl.pushDepth(...args);
export const pushKline = (...args: Parameters<BroadcastFns["pushKline"]>) => impl.pushKline(...args);
export const pushMiniTicker = (...args: Parameters<BroadcastFns["pushMiniTicker"]>) => impl.pushMiniTicker(...args);
export const pushExecutionReport = (...args: Parameters<BroadcastFns["pushExecutionReport"]>) =>
	impl.pushExecutionReport(...args);
export const pushBalanceUpdate = (...args: Parameters<BroadcastFns["pushBalanceUpdate"]>) =>
	impl.pushBalanceUpdate(...args);

export function registerBroadcastFns(fns: BroadcastFns) {
	impl = fns;
}
