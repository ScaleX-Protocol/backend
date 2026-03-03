// Shared in-memory cache: "chainId:address" → underlyingTokenAddress
// Populated by tokenRegistryHandler when synthetic currencies are registered.
// Ponder processes events in chronological order, so the cache is always
// populated before any transfer event that references a synthetic token.
const cache = new Map<string, string>();

export function setSyntheticCurrency(chainId: number, address: string, underlyingTokenAddress: string): void {
	cache.set(`${chainId}:${address.toLowerCase()}`, underlyingTokenAddress.toLowerCase());
}

export function getSyntheticUnderlyingToken(chainId: number, address: string): string | null {
	return cache.get(`${chainId}:${address.toLowerCase()}`) ?? null;
}
