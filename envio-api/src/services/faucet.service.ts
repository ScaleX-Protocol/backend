import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

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
      console.log(`💰 Faucet ETH balance: ${formatUnits(ethBalance, 18)} ETH`);
      console.log(`🎯 Amount to send: ${formatUnits(amountToSend, 18)} ETH (backend-configured)`);
      
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

      // Build and send transaction
      const nonce = await this.publicClient.getTransactionCount({
        address: this.account.address,
      });

      const transaction = {
        to: request.address,
        value: amountToSend,
        gas: gasEstimate,
        gasPrice: gasPrice,
        nonce,
      };

      console.log('📝 Native transfer transaction built:', transaction);

      // Sign transaction locally
      const signedTransaction = await this.walletClient.signTransaction({ ...transaction, account: this.walletClient.account!, chain: null });
      console.log('✍️ Native transfer transaction signed locally');

      // Send raw transaction
      const hash = await this.publicClient.sendRawTransaction({
        serializedTransaction: signedTransaction,
      });
      console.log('✅ Native transfer transaction sent successfully! Hash:', hash);

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
      console.error('Native transfer error:', error);
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
      console.log(`💰 Faucet balance: ${formatUnits(faucetBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      console.log(`🎯 Amount requested: ${formatUnits(amountToSend, tokenInfo.decimals)} ${tokenInfo.symbol}`);
      
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

      // Send the transaction using manual approach to avoid eth_sendTransaction
      console.log('🚀 Debug: Attempting to send transaction...');
      console.log('🔑 Faucet address:', this.account.address);
      console.log('🪙 Token address:', request.tokenAddress);
      console.log('💰 Amount to send:', formatUnits(amountToSend, tokenInfo.decimals));
      console.log('👛 Recipient:', request.address);
      
      let hash: `0x${string}` | undefined;
      
      try {
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
        const nonce = await this.publicClient.getTransactionCount({
          address: this.account.address,
        });

        // Build transaction
        const transaction = {
          to: request.tokenAddress,
          data: transferData,
          gas: gasEstimate,
          gasPrice: gasPrice,
          nonce,
        };

        console.log('📝 Transaction built:', transaction);

        // Sign transaction locally
        const signedTransaction = await this.walletClient.signTransaction({ ...transaction, account: this.walletClient.account!, chain: null });
        console.log('✍️ Transaction signed locally');

        // Send raw transaction
        hash = await this.publicClient.sendRawTransaction({
          serializedTransaction: signedTransaction,
        });
        console.log('✅ Transaction sent successfully! Hash:', hash);
      } catch (txError: any) {
        console.error('❌ Transaction failed:', txError);
        throw txError;
      }

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
      console.error('Faucet transfer error:', error);
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