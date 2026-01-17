import { mnemonicToAccount } from 'viem/accounts';

// Bot wallet names matching the API service
const WALLET_NAMES = [
  "Scalex 1",
  "Scalex 2",
  "MM Bot",
  "Trading Bot 1",
  "Trading Bot 2",
  "Trading Bot 3",
  "Faucet",
  "Trader 1",
  "Trader 2",
  "Trader 3",
];

// Cache for wallet address to name mapping
const walletCache = new Map<string, string>();

/**
 * Get wallet name from address using deterministic derivation
 */
export function getWalletName(address: string): string {
  // Normalize address to lowercase for comparison
  const normalizedAddress = address.toLowerCase();

  // Check cache first
  if (walletCache.has(normalizedAddress)) {
    return walletCache.get(normalizedAddress)!;
  }

  // Get seed phrase from environment
  const seedPhrase = process.env.WALLET_SEED_PHRASE;

  if (!seedPhrase) {
    throw new Error('WALLET_SEED_PHRASE environment variable is required for wallet tagging');
  }

  // Check indices 0-9 using deterministic derivation
  for (let i = 0; i < WALLET_NAMES.length; i++) {
    try {
      const account = mnemonicToAccount(seedPhrase, { addressIndex: i });
      const derivedAddress = account.address.toLowerCase();

      if (derivedAddress === normalizedAddress) {
        const walletName = WALLET_NAMES[i];
        walletCache.set(normalizedAddress, walletName);
        return walletName;
      }
    } catch (error) {
      console.error(`Error deriving wallet at index ${i}:`, error);
      continue;
    }
  }

  // If not found in known wallets, return full address
  walletCache.set(normalizedAddress, address);
  return address;
}

/**
 * Get wallet name by trying multiple address formats
 */
export function getWalletNameByAddress(address: string): string {
  // Try exact match first
  let walletName = getWalletName(address);

  if (walletName !== 'Unknown' && !walletName.includes('...')) {
    return walletName;
  }

  // Try with/without 0x prefix
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : `0x${address}`;
  walletName = getWalletName(cleanAddress);

  return walletName;
}

/**
 * Clear wallet cache (for testing)
 */
export function clearWalletCache(): void {
  walletCache.clear();
}