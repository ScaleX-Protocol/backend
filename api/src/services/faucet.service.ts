import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createLogger, LogLevel, LogLabel, ServiceName } from '../utils/logger';

export interface FaucetConfig {
  rpcUrl: string;
  privateKey: string;
  chainId: number;
  defaultAmount?: string;
  nativeAmount?: string;
}

export interface FaucetRequest {
  address: `0x${string}`;
  tokenAddress: `0x${string}`;
  amount?: string;
}

export interface NativeFaucetRequest {
  address: `0x${string}`;
}

export interface FaucetResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  amountSent?: string;
  amountRaw?: bigint;
  tokenSymbol?: string;
  tokenDecimals?: number;
}

export class FaucetService {
  private static instances: Map<number, FaucetService> = new Map();
  
  private publicClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createWalletClient>;
  private account: ReturnType<typeof privateKeyToAccount>;
  private config: FaucetConfig;
  private logger = createLogger('faucet.service.ts', ServiceName.SCALEX_API);
  private nonceManager: Map<string, { nonce: number; timestamp: number }> = new Map();
  private nonceLock: Promise<void> = Promise.resolve();

  private constructor(config: FaucetConfig) {
    this.config = config;
    this.account = privateKeyToAccount(config.privateKey as `0x${string}`);
    
    // Define chain configuration
    const chain = {
      id: config.chainId,
      name: config.chainId === 84532 ? 'Base Sepolia' : `Chain ${config.chainId}`,
      nativeCurrency: {
        name: 'ETH',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: {
        default: { http: [config.rpcUrl] },
        public: { http: [config.rpcUrl] },
      },
    };
    
    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(),
    });
  }

  public static getInstance(chainId: number, config: FaucetConfig): FaucetService {
    if (!FaucetService.instances.has(chainId)) {
      const service = new FaucetService(config);
      FaucetService.instances.set(chainId, service);
    }
    return FaucetService.instances.get(chainId)!;
  }

  private async getNextNonce(): Promise<number> {
    return new Promise((resolve) => {
      this.nonceLock = this.nonceLock.then(async () => {
        try {
          const address = this.account.address.toLowerCase();
          const now = Date.now();
          const cached = this.nonceManager.get(address);

          // If we have a recent cached nonce (less than 5 seconds old), use it
          if (cached && (now - cached.timestamp) < 5000) {
            const nextNonce = cached.nonce + 1;
            this.nonceManager.set(address, { nonce: nextNonce, timestamp: now });
            this.logger.info(`Using cached nonce: ${nextNonce} (cached nonce: ${cached.nonce}, age: ${now - cached.timestamp}ms)`, LogLabel.FAUCET, 'getNextNonce', {
              cachedNonce: cached.nonce,
              nextNonce,
              cacheAge: now - cached.timestamp
            });
            resolve(nextNonce);
            return;
          }

          // Fetch the current nonce from the network
          const currentNonce = await this.publicClient.getTransactionCount({
            address: this.account.address,
            blockTag: 'pending' // Include pending transactions
          });

          // If we have a cached nonce, use the higher value
          const nextNonce = cached ? Math.max(currentNonce, cached.nonce + 1) : currentNonce;
          
          this.nonceManager.set(address, { nonce: nextNonce, timestamp: now });
          this.logger.info(`Fetched fresh nonce: ${nextNonce} (network: ${currentNonce}, cached: ${cached?.nonce || 'none'})`, LogLabel.FAUCET, 'getNextNonce', {
            networkNonce: currentNonce,
            cachedNonce: cached?.nonce || null,
            selectedNonce: nextNonce,
            address: this.account.address
          });
          resolve(nextNonce);
        } catch (error) {
          this.logger.error('Error getting nonce, falling back to network fetch', LogLabel.FAUCET, 'getNextNonce', { 
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            address: this.account.address
          });
          // Fallback to network nonce
          const fallbackNonce = await this.publicClient.getTransactionCount({
            address: this.account.address,
          });
          this.logger.info(`Using fallback nonce: ${fallbackNonce}`, LogLabel.FAUCET, 'getNextNonce');
          resolve(fallbackNonce);
        }
      });
    });
  }

  private resetNonceCache(): void {
    const address = this.account.address.toLowerCase();
    this.nonceManager.delete(address);
    this.logger.info('Nonce cache reset', LogLabel.FAUCET, 'resetNonceCache');
  }

  private async sendTransactionWithRetry(
    transactionBuilder: () => Promise<any>,
    maxRetries: number = 3,
    operation: string = 'transaction'
  ): Promise<`0x${string}`> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info(`${operation} attempt ${attempt}/${maxRetries}`, LogLabel.FAUCET, 'sendTransactionWithRetry');
        
        // Build transaction with fresh nonce
        const transaction = await transactionBuilder();
        
        // Sign the transaction
        const signedTransaction = await this.walletClient.signTransaction({ 
          ...transaction, 
          account: this.walletClient.account!, 
          chain: null 
        });
        
        // Send the transaction
        const hash = await this.publicClient.sendRawTransaction({
          serializedTransaction: signedTransaction,
        });
        
        this.logger.info(`${operation} successful on attempt ${attempt}`, LogLabel.FAUCET, 'sendTransactionWithRetry', {
          hash,
          attempt,
          nonce: transaction.nonce
        });
        
        return hash;
        
      } catch (error: any) {
        lastError = error;
        const isNonceError = error.message?.toLowerCase().includes('nonce');
        const isReplacementUnderpricedError = error.message?.toLowerCase().includes('replacement transaction underpriced');
        const shouldRetry = isNonceError || isReplacementUnderpricedError;
        
        this.logger.error(`${operation} failed on attempt ${attempt}/${maxRetries}`, LogLabel.FAUCET, 'sendTransactionWithRetry', {
          error: error.message,
          code: error.code,
          isNonceError,
          isReplacementUnderpricedError,
          shouldRetry,
          attempt,
          willRetry: attempt < maxRetries && shouldRetry
        });
        
        // If it's a nonce-related error and we have retries left
        if (shouldRetry && attempt < maxRetries) {
          this.logger.warn(`Nonce/pricing error detected, resetting cache and retrying...`, LogLabel.FAUCET, 'sendTransactionWithRetry');
          this.resetNonceCache();
          
          // Add a small delay before retry to let the network settle
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        }
        
        // If we've exhausted retries or it's not a nonce error, throw
        if (attempt === maxRetries) {
          this.logger.error(`${operation} failed after ${maxRetries} attempts`, LogLabel.FAUCET, 'sendTransactionWithRetry', {
            finalError: error.message,
            totalAttempts: maxRetries
          });
          throw error;
        }
        
        // For non-nonce errors, throw immediately
        if (!shouldRetry) {
          throw error;
        }
      }
    }
    
    throw lastError;
  }

  public async sendNative(request: NativeFaucetRequest): Promise<FaucetResult> {
    try {
      // Validate address format
      if (!request.address || !request.address.startsWith('0x') || request.address.length !== 42) {
        return {
          success: false,
          error: 'Invalid recipient address format'
        };
      }

      // Use backend-defined amount
      const defaultAmount = this.config.nativeAmount || "0.01"; // Default to 0.01 ETH if not set
      const amountToSend = parseUnits(defaultAmount, 18);

      // Check faucet ETH balance
      const ethBalance = await this.publicClient.getBalance({ address: this.account.address });
      this.logger.info(`Faucet ETH balance: ${formatUnits(ethBalance, 18)} ETH`, LogLabel.FAUCET, 'sendNative', {
        balance: formatUnits(ethBalance, 18),
        amountToSend: formatUnits(amountToSend, 18),
        faucetAddress: this.account.address
      });
      
      // Estimate gas for native transfer
      const gasEstimate = BigInt(21000n); // Standard gas limit for ETH transfer
      const gasPrice = await this.publicClient.getGasPrice();
      const totalGasCost = gasEstimate * gasPrice;
      
      // Check if account has enough ETH for amount + gas
      const totalCost = amountToSend + totalGasCost;
      if (ethBalance < totalCost) {
        return {
          success: false,
          error: `Insufficient ETH for amount + gas. Required: ${formatUnits(totalCost, 18)} ETH, Available: ${formatUnits(ethBalance, 18)} ETH`
        };
      }

      // Build and send transaction with retry mechanism
      const hash = await this.sendTransactionWithRetry(async () => {
        const nonce = await this.getNextNonce();
        
        const transaction = {
          to: request.address,
          value: amountToSend,
          gas: gasEstimate,
          gasPrice: gasPrice,
          nonce,
        };

        this.logger.info('Native transfer transaction built', LogLabel.FAUCET, 'sendNative', { 
          to: request.address,
          value: amountToSend.toString(),
          valueFormatted: formatUnits(amountToSend, 18),
          gas: gasEstimate.toString(),
          gasPrice: gasPrice.toString(),
          gasPriceGwei: formatUnits(gasPrice, 9),
          nonce,
          from: this.account.address
        });

        return transaction;
      }, 3, 'Native transfer');

      // Wait for transaction confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 30000,
      });

      if (receipt.status === 'success') {
        return {
          success: true,
          transactionHash: hash,
          amountSent: formatUnits(amountToSend, 18),
          amountRaw: amountToSend,
          tokenSymbol: 'ETH',
          tokenDecimals: 18
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed',
          transactionHash: hash
        };
      }
    } catch (error) {
      this.logger.error('Native transfer error', LogLabel.FAUCET, 'sendNative', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details,
        reason: (error as any)?.reason,
        to: request.address,
        amount: this.config.nativeAmount || "0.01",
        faucetAddress: this.account.address,
        stack: error instanceof Error ? error.stack : undefined 
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  public async sendTokens(request: FaucetRequest): Promise<FaucetResult> {
    try {
      // Validate address format
      if (!request.address || !request.address.startsWith('0x') || request.address.length !== 42) {
        return {
          success: false,
          error: 'Invalid recipient address format'
        };
      }

      if (!request.tokenAddress || !request.tokenAddress.startsWith('0x') || request.tokenAddress.length !== 42) {
        return {
          success: false,
          error: 'Invalid token address format'
        };
      }

      // Get token info
      const tokenInfo = await this.getTokenInfo(request.tokenAddress);
      if (!tokenInfo) {
        return {
          success: false,
          error: 'Token not found or invalid'
        };
      }

      // Determine amount to send
      let amountToSend: bigint;
      if (request.amount) {
        amountToSend = parseUnits(request.amount, tokenInfo.decimals);
      } else {
        const defaultAmount = this.config.defaultAmount || "1000";
        amountToSend = parseUnits(defaultAmount, tokenInfo.decimals);
      }

      // Check faucet balance
      const faucetBalance = await this.getTokenBalance(request.tokenAddress, this.account.address);
      this.logger.info(`Token faucet balance: ${formatUnits(faucetBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`, LogLabel.FAUCET, 'sendTokens', {
        balance: formatUnits(faucetBalance, tokenInfo.decimals),
        amountRequested: formatUnits(amountToSend, tokenInfo.decimals),
        tokenSymbol: tokenInfo.symbol,
        tokenAddress: request.tokenAddress
      });
      
      if (faucetBalance < amountToSend) {
        return {
          success: false,
          error: `Insufficient faucet balance. Available: ${formatUnits(faucetBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`
        };
      }

      // Estimate gas for the transfer
      const gasEstimate = await this.publicClient.estimateContractGas({
        address: request.tokenAddress,
        abi: [
          {
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' }
            ],
            name: 'transfer',
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
            type: 'function'
          }
        ],
        functionName: 'transfer',
        args: [request.address, amountToSend],
        account: this.account.address,
      });

      // Get current gas price
      const gasPrice = await this.publicClient.getGasPrice();

      // Check if account has enough ETH for gas
      const ethBalance = await this.publicClient.getBalance({ address: this.account.address });
      const totalGasCost = gasEstimate * BigInt(gasPrice);
      
      if (ethBalance < totalGasCost) {
        return {
          success: false,
          error: `Insufficient ETH for gas. Required: ${formatUnits(totalGasCost, 18)} ETH, Available: ${formatUnits(ethBalance, 18)} ETH`
        };
      }

      // Send the transaction with retry mechanism
      this.logger.info('Attempting to send token transaction', LogLabel.FAUCET, 'sendTokens', {
        faucetAddress: this.account.address,
        tokenAddress: request.tokenAddress,
        amountToSend: formatUnits(amountToSend, tokenInfo.decimals),
        recipient: request.address,
        tokenSymbol: tokenInfo.symbol
      });
      
      const hash = await this.sendTransactionWithRetry(async () => {
        // Build the transaction data
        const transferData = encodeFunctionData({
          abi: [
            {
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' }
              ],
              name: 'transfer',
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'nonpayable',
              type: 'function'
            }
          ],
          functionName: 'transfer',
          args: [request.address, amountToSend],
        });

        // Get nonce
        const nonce = await this.getNextNonce();

        // Build transaction
        const transaction = {
          to: request.tokenAddress,
          data: transferData,
          gas: gasEstimate,
          gasPrice: gasPrice,
          nonce,
        };

        this.logger.info('Token transaction built', LogLabel.FAUCET, 'sendTokens', { 
          to: request.tokenAddress,
          recipient: request.address,
          amount: formatUnits(amountToSend, tokenInfo.decimals),
          tokenSymbol: tokenInfo.symbol,
          gas: gasEstimate.toString(),
          gasPrice: gasPrice.toString(),
          gasPriceGwei: formatUnits(gasPrice, 9),
          nonce,
          from: this.account.address
        });

        return transaction;
      }, 3, 'Token transfer');

      // Wait for transaction confirmation (with shorter timeout for testing)
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1, // Reduced for faster testing
        timeout: 30000, // 30 seconds timeout
      });

      if (receipt.status === 'success') {
        return {
          success: true,
          transactionHash: hash,
          amountSent: formatUnits(amountToSend, tokenInfo.decimals),
          amountRaw: amountToSend,
          tokenSymbol: tokenInfo.symbol,
          tokenDecimals: tokenInfo.decimals
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed',
          transactionHash: hash
        };
      }
    } catch (error) {
      this.logger.error('Token transfer error', LogLabel.FAUCET, 'sendTokens', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details,
        reason: (error as any)?.reason,
        tokenAddress: request.tokenAddress,
        recipient: request.address,
        amount: request.amount || this.config.defaultAmount,
        faucetAddress: this.account.address,
        stack: error instanceof Error ? error.stack : undefined
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  private async getTokenInfo(tokenAddress: `0x${string}`): Promise<{ symbol: string; decimals: number } | null> {
    try {
      // Get token symbol
      const symbolResult = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            inputs: [],
            name: 'symbol',
            outputs: [{ name: '', type: 'string' }],
            stateMutability: 'view',
            type: 'function'
          }
        ],
        functionName: 'symbol',
        args: [],
      });

      // Get token decimals
      const decimalsResult = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            inputs: [],
            name: 'decimals',
            outputs: [{ name: '', type: 'uint8' }],
            stateMutability: 'view',
            type: 'function'
          }
        ],
        functionName: 'decimals',
        args: [],
      });

      return {
        symbol: symbolResult || 'UNKNOWN',
        decimals: Number(decimalsResult) || 18
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      return null;
    }
  }

  private async getTokenBalance(tokenAddress: `0x${string}`, address: `0x${string}`): Promise<bigint> {
    try {
      const balance = await this.publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            inputs: [{ name: 'account', type: 'address' }],
            name: 'balanceOf',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function'
          }
        ],
        functionName: 'balanceOf',
        args: [address],
      });
      
      return balance as bigint;
    } catch (error) {
      console.error('Error getting token balance:', error);
      return BigInt(0);
    }
  }

  public async getFaucetAddress(): Promise<`0x${string}`> {
    return this.account.address;
  }

  public getConfig(): FaucetConfig {
    return { ...this.config };
  }
}