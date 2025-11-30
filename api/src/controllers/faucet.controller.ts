import { and, eq, sql } from 'drizzle-orm';
import { db } from '../config/database';
import { faucetRequests, NewFaucetRequest } from '../schema/faucet.schema';
import { FaucetConfig, FaucetService } from '../services/faucet.service';
import { RateLimitService } from '../services/ratelimit.service';
import { createLogger, LogLabel, ServiceName } from '../utils/logger';

export class FaucetController {
  private rateLimitService: RateLimitService;
  private logger = createLogger('faucet.controller.ts', ServiceName.SCALEX_API);

  constructor() {
    this.rateLimitService = RateLimitService.getInstance();
  }

  public async requestNativeTokens(
    address: string,
    chainId: number,
    clientIP: string,
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    this.logger.info(`Native faucet request from ${address} on chain ${chainId}`, LogLabel.FAUCET, 'requestNativeTokens', {
      address,
      chainId,
      clientIP
    });

    try {
      // Validate inputs
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        this.logger.warn(`Invalid address format: ${address}`, LogLabel.VALIDATION, 'requestNativeTokens', {
          address,
          chainId
        });
        return {
          success: false,
          error: 'Invalid address format'
        };
      }

      // Check rate limits
      const rateLimitResult = await this.rateLimitService.checkBothLimits(address, clientIP);
      if (!rateLimitResult.allowed) {
        const reason = rateLimitResult.reason || 'Rate limit exceeded';
        this.logger.warn(`Rate limit exceeded for ${address}`, LogLabel.RATE_LIMIT, 'requestNativeTokens', {
          address,
          clientIP,
          reason,
          rateLimitResult
        });
        return {
          success: false,
          error: `Rate limit exceeded: ${reason}`
        };
      }

      // Get faucet configuration for this chain (same as existing token faucet)
      let faucetConfig = this.getFaucetConfig(chainId);
      if (!faucetConfig) {
        this.logger.error(`Faucet not configured for chain ${chainId}`, LogLabel.FAUCET, 'requestNativeTokens', {
          chainId,
          address
        });
        return {
          success: false,
          error: "Faucet not available for this chain"
        };
      }

      // Add nativeAmount to the config
      faucetConfig = {
        ...faucetConfig,
        nativeAmount: process.env.FAUCET_NATIVE_AMOUNT || '0.01'
      };

      // Initialize faucet service
      const faucetService = FaucetService.getInstance(chainId, faucetConfig);

      // Send native tokens with backend-defined amount
      const result = await faucetService.sendNative({
        address: address as `0x${string}`
      });

      if (result.success) {
        this.logger.info(`Native faucet transfer successful to ${address}`, LogLabel.FAUCET, 'requestNativeTokens', {
          address,
          chainId,
          transactionHash: result.transactionHash,
          amountSent: result.amountSent
        });
      } else {
        this.logger.error(`Native faucet transfer failed for ${address}`, LogLabel.FAUCET, 'requestNativeTokens', {
          address,
          chainId,
          error: result.error
        });
      }

      return {
        success: result.success,
        transactionHash: result.transactionHash,
        error: result.error
      };

    } catch (error: any) {
      this.logger.error(`Native faucet request exception for ${address}`, LogLabel.FAUCET, 'requestNativeTokens', {
        address,
        chainId,
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      };
    }
  }

  public async requestTokens(
    address: string,
    tokenAddress: string,
    chainId: number,
    clientIP: string,
    userAgent?: string
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    this.logger.info(`Token faucet request from ${address} for token ${tokenAddress} on chain ${chainId}`, LogLabel.FAUCET, 'requestTokens', {
      address,
      tokenAddress,
      chainId,
      clientIP
    });

    try {
      // Validate inputs
      if (!address || !tokenAddress) {
        return {
          success: false,
          error: "Address and tokenAddress are required"
        };
      }

      if (!address.startsWith('0x') || address.length !== 42) {
        return {
          success: false,
          error: "Invalid address format"
        };
      }

      if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        return {
          success: false,
          error: "Invalid token address format"
        };
      }

      // Check rate limits and cooldowns
      const rateLimitCheck = await this.rateLimitService.checkBothLimits(
        address.toLowerCase(),
        clientIP,
        3, // 3 requests per hour
        60 * 60 * 1000, // 1 hour window
        4 * 60 * 60 * 1000 // 4 hour cooldown
      );

      if (!rateLimitCheck.allowed) {
        let message = "Request blocked";
        switch (rateLimitCheck.reason) {
          case "ADDRESS_RATE_LIMIT":
            message = "Address rate limit exceeded. Please try again later.";
            break;
          case "IP_RATE_LIMIT":
            message = "IP rate limit exceeded. Please try again later.";
            break;
          case "ADDRESS_COOLDOWN":
            message = `Address cooldown active. Please wait ${Math.ceil(rateLimitCheck.remainingCooldown / (1000 * 60))} minutes.`;
            break;
          case "IP_COOLDOWN":
            message = `IP cooldown active. Please wait ${Math.ceil(rateLimitCheck.remainingCooldown / (1000 * 60))} minutes.`;
            break;
        }

        return {
          success: false,
          error: message
        };
      }

      // Get faucet configuration
      const faucetConfig = this.getFaucetConfig(chainId);
      if (!faucetConfig) {
        return {
          success: false,
          error: "Faucet not available for this chain"
        };
      }

      // Use backend-defined amount
      const defaultAmount = faucetConfig.defaultAmount;

      // Initialize faucet service
      const faucetService = FaucetService.getInstance(chainId, faucetConfig);

      // Record initial request as pending
      const requestId = await this.recordFaucetRequest({
        chainId,
        requesterAddress: address,
        receiverAddress: address,
        tokenAddress,
        tokenSymbol: 'UNKNOWN', // Will be updated after service call
        tokenDecimals: 18, // Will be updated after service call
        amount: BigInt(0), // Will be updated after service call
        amountFormatted: defaultAmount || '0',
        status: 'pending',
        requestTimestamp: new Date(),
        ipAddress: clientIP,
        userAgent: userAgent || null
      });

      // Send tokens with backend-defined amount
      const result = await faucetService.sendTokens({
        address: address as `0x${string}`,
        tokenAddress: tokenAddress as `0x${string}`,
        amount: defaultAmount
      });

      if (result.success && requestId) {
        // Update request as completed
        await this.updateFaucetRequest(requestId.toString(), {
          status: 'completed',
          transactionHash: result.transactionHash || '',
          tokenSymbol: result.tokenSymbol || 'UNKNOWN',
          tokenDecimals: result.tokenDecimals || 18,
          amount: result.amountRaw || BigInt(0), // Use the raw amount from service
          amountFormatted: result.amountSent || '0',
          completedTimestamp: new Date()
        });

        // Consume rate limit and set cooldowns after successful request
        await this.rateLimitService.consumeBothLimits(
          address.toLowerCase(),
          clientIP,
          3, // 3 requests per hour
          60 * 60 * 1000 // 1 hour window
        );

        await this.rateLimitService.setCooldown(`addr:${address.toLowerCase()}`, 'address', 4 * 60 * 60 * 1000); // 4 hour address cooldown
        await this.rateLimitService.setCooldown(`ip:${clientIP}`, 'ip', 4 * 60 * 60 * 1000); // 4 hour IP cooldown

        return {
          success: true,
          data: {
            message: "Tokens sent successfully",
            transactionHash: result.transactionHash,
            amountSent: result.amountSent,
            tokenSymbol: result.tokenSymbol,
            chainId,
            requestId,
            timestamp: Date.now()
          }
        };
      } else if (requestId) {
        // Update request as failed
        await this.updateFaucetRequest(requestId.toString(), {
          status: 'failed',
          errorMessage: result.error || 'Unknown error',
          completedTimestamp: new Date()
        });
      }

      return {
        success: false,
        error: result.error
      };
    } catch (error: any) {
      this.logger.error(`Token faucet request exception for ${address}`, LogLabel.FAUCET, 'requestTokens', {
        address,
        tokenAddress,
        chainId,
        error: error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error?.message || "Failed to process faucet request"
      };
    }
  }

  public async getFaucetAddress(chainId: number): Promise<{ success: boolean; address?: string; error?: string }> {
    try {
      const faucetConfig = this.getFaucetConfig(chainId);
      if (!faucetConfig) {
        return {
          success: false,
          error: "Faucet not available for this chain"
        };
      }

      const faucetService = FaucetService.getInstance(chainId, faucetConfig);
      const address = await faucetService.getFaucetAddress();

      return {
        success: true,
        address
      };
    } catch (error: any) {
      console.error("Error getting faucet address:", error);
      return {
        success: false,
        error: error?.message || "Failed to get faucet address"
      };
    }
  }

  public async getFaucetHistory(
    address?: string,
    chainId?: number,
    limit: number = 50
  ): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {

      // Build where conditions
      const conditions = [];
      if (address && chainId) {
        conditions.push(
          and(
            sql`LOWER(${faucetRequests.requesterAddress}) = LOWER(${address})`,
            eq(faucetRequests.chainId, chainId)
          )
        );
      } else if (address) {
        conditions.push(sql`LOWER(${faucetRequests.requesterAddress}) = LOWER(${address})`);
      } else if (chainId) {
        conditions.push(eq(faucetRequests.chainId, chainId));
      }

      const results = await db
        .select()
        .from(faucetRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(faucetRequests.requestTimestamp)
        .limit(limit);

      // Convert BigInt to string for JSON serialization
      const serializedResults = results.map(record => ({
        ...record,
        amount: record.amount ? record.amount.toString() : '0',
        gasUsed: record.gasUsed ? record.gasUsed.toString() : null,
        gasPrice: record.gasPrice ? record.gasPrice.toString() : null,
      }));

      return {
        success: true,
        data: serializedResults
      };
    } catch (error: any) {
      console.error("Error getting faucet history:", error);
      return {
        success: false,
        error: error?.message || "Failed to get faucet history"
      };
    }
  }

  private async recordFaucetRequest(request: NewFaucetRequest): Promise<number | null> {
    try {
      const result = await db.insert(faucetRequests).values(request).returning({ id: faucetRequests.id });
      return result[0]?.id || null;
    } catch (error) {
      console.error('Failed to record faucet request:', error);
      return null;
    }
  }

  private async updateFaucetRequest(
    id: string,
    updates: Partial<NewFaucetRequest>
  ): Promise<boolean> {
    try {
      const updateData: any = {};

      if (updates.status) updateData.status = updates.status;
      if (updates.transactionHash) updateData.transactionHash = updates.transactionHash.toLowerCase();
      if (updates.amount) updateData.amount = updates.amount;
      if (updates.amountFormatted) updateData.amountFormatted = updates.amountFormatted;
      if (updates.tokenSymbol) updateData.tokenSymbol = updates.tokenSymbol;
      if (updates.tokenDecimals) updateData.tokenDecimals = updates.tokenDecimals;
      if (updates.errorMessage) updateData.errorMessage = updates.errorMessage;
      if (updates.completedTimestamp) updateData.completedTimestamp = updates.completedTimestamp;

      if (Object.keys(updateData).length === 0) {
        return false;
      }

      await db
        .update(faucetRequests)
        .set(updateData)
        .where(eq(faucetRequests.id, parseInt(id)));

      return true;
    } catch (error) {
      console.error('Failed to update faucet request:', error);
      return false;
    }
  }

  private getRpcUrls(chainId: number): string[] {
    // Get RPC URLs from FAUCET_RPC_URL environment variable (comma-separated format)
    const faucetRpcUrl = process.env[`FAUCET_RPC_URL_${chainId}`];
    
    if (faucetRpcUrl) {
      // Handle comma-separated URLs
      if (faucetRpcUrl.includes(',')) {
        return faucetRpcUrl.split(',').map(url => url.trim()).filter(url => url);
      } else {
        return [faucetRpcUrl.trim()];
      }
    }
    
    // Fallback to default URLs if no FAUCET_RPC_URL is configured
    switch (chainId) {
      case 84532:
        return ['https://base-sepolia.g.alchemy.com/v2/jBG4sMyhez7V13jNTeQKfVfgNa54nCmF'];
      case 31337:
        return ['http://host.docker.internal:8545'];
      case 31338:
        return ['http://host.docker.internal:8546'];
      default:
        return [];
    }
  }

  private getFaucetConfig(chainId: number): FaucetConfig | null {
    const rpcUrls = this.getRpcUrls(chainId);
    
    if (rpcUrls.length === 0) {
      return null;
    }
    
    
    const configs: Record<number, FaucetConfig> = {
      // Base Sepolia Testnet (Chain ID: 84532)
      84532: {
        rpcUrl: rpcUrls,
        privateKey: process.env.FAUCET_PRIVATE_KEY || '',
        chainId: 84532,
        defaultAmount: process.env.FAUCET_DEFAULT_AMOUNT || '1000'
      },
      // Local Anvil (Chain ID: 31337) - for development
      31337: {
        rpcUrl: rpcUrls,
        privateKey: process.env.FAUCET_PRIVATE_KEY || '',
        chainId: 31337,
        defaultAmount: process.env.FAUCET_DEFAULT_AMOUNT || '1000'
      },
      // Local Anvil (Chain ID: 31338) - for development
      31338: {
        rpcUrl: rpcUrls,
        privateKey: process.env.FAUCET_PRIVATE_KEY || '',
        chainId: 31338,
        defaultAmount: process.env.FAUCET_DEFAULT_AMOUNT || '1000'
      }
    };

    return configs[chainId] || null;
  }
}