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
  private nonceManager: Map<string, { nonce: number; timestamp: number; lastSuccessfulNonce?: number }> = new Map();
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
            this.nonceManager.set(address, { 
              nonce: nextNonce, 
              timestamp: now,
              lastSuccessfulNonce: cached.lastSuccessfulNonce 
            });
            this.logger.info(`Using cached nonce: ${nextNonce} (cached nonce: ${cached.nonce}, age: ${now - cached.timestamp}ms)`, LogLabel.FAUCET, 'getNextNonce', {
              cachedNonce: cached.nonce,
              nextNonce,
              lastSuccessfulNonce: cached.lastSuccessfulNonce,
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

          // Smart nonce selection based on successful transactions
          let nextNonce: number;
          if (cached?.lastSuccessfulNonce !== undefined) {
            // We have a record of successful transactions
            nextNonce = Math.max(currentNonce, cached.lastSuccessfulNonce + 1);
          } else if (cached) {
            // We have attempted transactions but no confirmed successful ones
            nextNonce = Math.max(currentNonce, cached.nonce + 1);
          } else {
            // No cache, use network nonce
            nextNonce = currentNonce;
          }
          
          this.nonceManager.set(address, { 
            nonce: nextNonce, 
            timestamp: now,
            lastSuccessfulNonce: cached?.lastSuccessfulNonce 
          });
          this.logger.info(`Fetched fresh nonce: ${nextNonce} (network: ${currentNonce}, cached: ${cached?.nonce || 'none'}, lastSuccessful: ${cached?.lastSuccessfulNonce || 'none'})`, LogLabel.FAUCET, 'getNextNonce', {
            networkNonce: currentNonce,
            cachedNonce: cached?.nonce || null,
            lastSuccessfulNonce: cached?.lastSuccessfulNonce || null,
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

  private recordSuccessfulNonce(nonce: number): void {
    const address = this.account.address.toLowerCase();
    const now = Date.now();
    const existing = this.nonceManager.get(address);
    
    this.nonceManager.set(address, {
      nonce: nonce,
      timestamp: now,
      lastSuccessfulNonce: nonce
    });
    
    this.logger.info(`Recorded successful nonce: ${nonce}`, LogLabel.FAUCET, 'recordSuccessfulNonce', {
      nonce,
      previousSuccessful: existing?.lastSuccessfulNonce,
      address: this.account.address
    });
  }

  private async recoverFromNonceError(attempt: number): Promise<void> {
    const address = this.account.address.toLowerCase();
    const currentTime = Date.now();
    
    this.logger.info(`Attempting nonce recovery on attempt ${attempt}`, LogLabel.FAUCET, 'recoverFromNonceError');
    
    try {
      // Get the most up-to-date network state
      const [networkNonce, pendingNonce] = await Promise.all([
        this.publicClient.getTransactionCount({ address: this.account.address, blockTag: 'latest' }),
        this.publicClient.getTransactionCount({ address: this.account.address, blockTag: 'pending' })
      ]);
      
      const existing = this.nonceManager.get(address);
      
      // Determine the next logical nonce to try
      let nextNonce: number;
      
      if (pendingNonce > networkNonce) {
        // There are pending transactions - use pending nonce
        nextNonce = pendingNonce;
        this.logger.info(`Using pending nonce: ${nextNonce} (network: ${networkNonce}, pending: ${pendingNonce})`, LogLabel.FAUCET, 'recoverFromNonceError');
      } else if (existing?.lastSuccessfulNonce !== undefined) {
        // Use last successful + 1, but ensure it's at least the network nonce
        nextNonce = Math.max(networkNonce, existing.lastSuccessfulNonce + 1);
        this.logger.info(`Using successful-based nonce: ${nextNonce} (lastSuccessful: ${existing.lastSuccessfulNonce}, network: ${networkNonce})`, LogLabel.FAUCET, 'recoverFromNonceError');
      } else {
        // Fallback to network nonce + attempt offset for progressive retry
        nextNonce = networkNonce + Math.max(0, attempt - 1);
        this.logger.info(`Using network nonce with offset: ${nextNonce} (network: ${networkNonce}, attempt: ${attempt})`, LogLabel.FAUCET, 'recoverFromNonceError');
      }
      
      // Update the cache with the recovery nonce
      this.nonceManager.set(address, {
        nonce: nextNonce,
        timestamp: currentTime,
        lastSuccessfulNonce: existing?.lastSuccessfulNonce
      });
      
      this.logger.info(`Nonce recovery complete: set to ${nextNonce}`, LogLabel.FAUCET, 'recoverFromNonceError', {
        networkNonce,
        pendingNonce,
        selectedNonce: nextNonce,
        lastSuccessful: existing?.lastSuccessfulNonce,
        attempt
      });
      
    } catch (error) {
      this.logger.error('Failed to recover nonce, will reset cache', LogLabel.FAUCET, 'recoverFromNonceError', {
        error: error instanceof Error ? error.message : 'Unknown error',
        attempt
      });
      this.resetNonceCache();
    }
  }

  private async findGuaranteedValidNonce(): Promise<number> {
    this.logger.info('Starting systematic nonce search', LogLabel.FAUCET, 'findGuaranteedValidNonce');
    
    // Get the absolute latest network state
    const [latestNonce, pendingNonce] = await Promise.all([
      this.publicClient.getTransactionCount({ address: this.account.address, blockTag: 'latest' }),
      this.publicClient.getTransactionCount({ address: this.account.address, blockTag: 'pending' })
    ]);
    
    const address = this.account.address.toLowerCase();
    const existing = this.nonceManager.get(address);
    
    // Start from the highest known good nonce
    const startNonce = Math.max(
      latestNonce,
      pendingNonce, 
      existing?.lastSuccessfulNonce ? existing.lastSuccessfulNonce + 1 : 0
    );
    
    this.logger.info(`Systematic search starting from nonce ${startNonce}`, LogLabel.FAUCET, 'findGuaranteedValidNonce', {
      latestNonce,
      pendingNonce,
      lastSuccessfulNonce: existing?.lastSuccessfulNonce,
      startNonce
    });
    
    // In most cases, the network nonce should work
    // But we can add a small buffer to handle edge cases
    const guaranteedNonce = Math.max(startNonce, latestNonce);
    
    this.logger.info(`Selected guaranteed nonce: ${guaranteedNonce}`, LogLabel.FAUCET, 'findGuaranteedValidNonce', {
      guaranteedNonce,
      reasoning: 'Using latest network nonce as guaranteed valid'
    });
    
    return guaranteedNonce;
  }

  private async sendTransactionWithRetry(
    transactionBuilder: () => Promise<any>,
    maxRetries: number = 10, // Increase default retries
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
        
        // Record the successful nonce
        this.recordSuccessfulNonce(transaction.nonce);
        
        return hash;
        
      } catch (error: any) {
        lastError = error;
        // Check various error patterns that indicate nonce/transaction issues
        const errorMsg = (error.message || '').toLowerCase();
        const errorReason = (error.reason || '').toLowerCase();
        const errorDetails = (error.details || '').toLowerCase();
        const allErrorText = `${errorMsg} ${errorReason} ${errorDetails}`;
        
        const isNonceError = allErrorText.includes('nonce');
        const isReplacementUnderpricedError = allErrorText.includes('replacement transaction underpriced');
        const isGasTooLowError = allErrorText.includes('gas too low') || allErrorText.includes('intrinsic gas too low');
        const isInsufficientFundsError = allErrorText.includes('insufficient funds');
        const isAlreadyKnownError = allErrorText.includes('already known');
        
        const shouldRetry = isNonceError || isReplacementUnderpricedError || isAlreadyKnownError;
        
        this.logger.error(`${operation} failed on attempt ${attempt}/${maxRetries}`, LogLabel.FAUCET, 'sendTransactionWithRetry', {
          error: error.message,
          code: error.code,
          details: error.details,
          reason: error.reason,
          data: error.data,
          shortMessage: error.shortMessage,
          isNonceError,
          isReplacementUnderpricedError,
          isGasTooLowError,
          isInsufficientFundsError,
          isAlreadyKnownError,
          shouldRetry,
          attempt,
          willRetry: attempt < maxRetries && shouldRetry,
          allErrorText: allErrorText.substring(0, 500), // Truncate for logging
          stack: error.stack
        });
        
        // If it's a retryable error and we have retries left
        if (shouldRetry && attempt < maxRetries) {
          this.logger.warn(`Retryable error detected, attempting recovery...`, LogLabel.FAUCET, 'sendTransactionWithRetry');
          
          // For nonce errors, try a more systematic approach
          if (isNonceError) {
            await this.recoverFromNonceError(attempt);
          } else {
            // For other retryable errors, just reset cache
            this.resetNonceCache();
          }
          
          // Progressive delay: 1s, 2s, 3s, then cap at 5s
          const delay = Math.min(1000 * attempt, 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If we've exhausted retries, try one last systematic approach for nonce errors
        if (attempt === maxRetries && isNonceError) {
          this.logger.warn(`Attempting final systematic nonce recovery after ${maxRetries} attempts`, LogLabel.FAUCET, 'sendTransactionWithRetry');
          
          try {
            const guaranteedNonce = await this.findGuaranteedValidNonce();
            this.logger.info(`Found guaranteed valid nonce: ${guaranteedNonce}`, LogLabel.FAUCET, 'sendTransactionWithRetry');
            
            // Set the guaranteed nonce and try one more time
            const address = this.account.address.toLowerCase();
            this.nonceManager.set(address, {
              nonce: guaranteedNonce,
              timestamp: Date.now(),
              lastSuccessfulNonce: this.nonceManager.get(address)?.lastSuccessfulNonce
            });
            
            // Continue the loop for one final attempt
            maxRetries++; // Extend retry count for this final attempt
            continue;
          } catch (guaranteeError) {
            this.logger.error(`Failed to find guaranteed nonce`, LogLabel.FAUCET, 'sendTransactionWithRetry', {
              error: guaranteeError instanceof Error ? guaranteeError.message : 'Unknown error'
            });
          }
        }
        
        // If we've truly exhausted all options, throw
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