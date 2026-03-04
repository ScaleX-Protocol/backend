import { db } from '../config/database';
import { faucetRateLimits } from '../schema/faucet.schema';
import { eq, and, gt, lt } from 'drizzle-orm';

interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  remaining: number;
  resetTime: number;
  remainingCooldown: number;
}

export class RateLimitService {
  private static instance: RateLimitService;

  private constructor() {}

  public static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  public async checkBothLimits(
    address: string,
    ip: string,
    maxRequests: number = 3,
    windowMs: number = 60 * 60 * 1000, // 1 hour
    cooldownMs: number = 4 * 60 * 60 * 1000 // 4 hours
  ): Promise<RateLimitResult> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Check address-based rate limit
    const addressLimit = await this.checkRateLimit(
      address.toLowerCase(),
      'address',
      maxRequests,
      windowStart,
      now
    );

    if (!addressLimit.allowed) {
      return {
        allowed: false,
        reason: "ADDRESS_RATE_LIMIT",
        remaining: addressLimit.remaining,
        resetTime: addressLimit.resetTime,
        remainingCooldown: 0
      };
    }

    // Check IP-based rate limit
    const ipLimit = await this.checkRateLimit(
      ip,
      'ip',
      maxRequests,
      windowStart,
      now
    );

    if (!ipLimit.allowed) {
      return {
        allowed: false,
        reason: "IP_RATE_LIMIT",
        remaining: ipLimit.remaining,
        resetTime: ipLimit.resetTime,
        remainingCooldown: 0
      };
    }

    // Check address-based cooldown
    const addressCooldown = await this.checkCooldown(address.toLowerCase(), 'address', now);
    if (!addressCooldown.allowed) {
      return {
        allowed: false,
        reason: "ADDRESS_COOLDOWN",
        remaining: addressLimit.remaining,
        resetTime: addressLimit.resetTime,
        remainingCooldown: addressCooldown.remainingTime
      };
    }

    // Check IP-based cooldown
    const ipCooldown = await this.checkCooldown(ip, 'ip', now);
    if (!ipCooldown.allowed) {
      return {
        allowed: false,
        reason: "IP_COOLDOWN",
        remaining: addressLimit.remaining,
        resetTime: addressLimit.resetTime,
        remainingCooldown: ipCooldown.remainingTime
      };
    }

    return {
      allowed: true,
      remaining: Math.min(addressLimit.remaining, ipLimit.remaining),
      resetTime: Math.min(addressLimit.resetTime, ipLimit.resetTime),
      remainingCooldown: 0
    };
  }

  public async consumeBothLimits(
    address: string,
    ip: string,
    maxRequests: number = 3,
    windowMs: number = 60 * 60 * 1000
  ): Promise<{ allowed: boolean; reason?: string; remaining: number; resetTime: number }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Consume address-based rate limit
    const addressLimit = await this.consumeRateLimit(
      address.toLowerCase(),
      'address',
      maxRequests,
      windowStart,
      now
    );

    if (!addressLimit.allowed) {
      return {
        allowed: false,
        reason: "ADDRESS_RATE_LIMIT",
        remaining: addressLimit.remaining,
        resetTime: addressLimit.resetTime
      };
    }

    // Consume IP-based rate limit
    const ipLimit = await this.consumeRateLimit(
      ip,
      'ip',
      maxRequests,
      windowStart,
      now
    );

    if (!ipLimit.allowed) {
      return {
        allowed: false,
        reason: "IP_RATE_LIMIT",
        remaining: ipLimit.remaining,
        resetTime: ipLimit.resetTime
      };
    }

    return {
      allowed: true,
      remaining: Math.min(addressLimit.remaining, ipLimit.remaining),
      resetTime: Math.min(addressLimit.resetTime, ipLimit.resetTime)
    };
  }

  public async setCooldown(identifier: string, identifierType: 'address' | 'ip', cooldownMs: number): Promise<void> {
    const cooldownUntil = new Date(Date.now() + cooldownMs);
    
    await db.insert(faucetRateLimits)
      .values({
        identifier: identifierType === 'address' ? identifier.toLowerCase() : identifier,
        identifierType,
        requestCount: 0,
        windowStart: new Date(),
        lastRequestTime: new Date(),
        cooldownUntil
      })
      .onConflictDoUpdate({
        target: [faucetRateLimits.identifier, faucetRateLimits.identifierType],
        set: {
          cooldownUntil,
          lastRequestTime: new Date()
        }
      });
  }

  private async checkRateLimit(
    identifier: string,
    identifierType: 'address' | 'ip',
    maxRequests: number,
    windowStart: Date,
    now: Date
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const record = await db.query.faucetRateLimits.findFirst({
      where: and(
        eq(faucetRateLimits.identifier, identifierType === 'address' ? identifier.toLowerCase() : identifier),
        eq(faucetRateLimits.identifierType, identifierType)
      )
    });

    if (!record || record.windowStart < windowStart) {
      // No previous request or window expired
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now.getTime() + (60 * 60 * 1000)
      };
    }

    if (record.requestCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.windowStart.getTime() + (60 * 60 * 1000)
      };
    }

    return {
      allowed: true,
      remaining: maxRequests - record.requestCount - 1,
      resetTime: record.windowStart.getTime() + (60 * 60 * 1000)
    };
  }

  private async consumeRateLimit(
    identifier: string,
    identifierType: 'address' | 'ip',
    maxRequests: number,
    windowStart: Date,
    now: Date
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const record = await db.query.faucetRateLimits.findFirst({
      where: and(
        eq(faucetRateLimits.identifier, identifierType === 'address' ? identifier.toLowerCase() : identifier),
        eq(faucetRateLimits.identifierType, identifierType)
      )
    });

    if (!record || record.windowStart < windowStart) {
      // First request or window expired
      await db.insert(faucetRateLimits)
        .values({
          identifier: identifierType === 'address' ? identifier.toLowerCase() : identifier,
          identifierType,
          requestCount: 1,
          windowStart: now,
          lastRequestTime: now
        })
        .onConflictDoUpdate({
          target: [faucetRateLimits.identifier, faucetRateLimits.identifierType],
          set: {
            requestCount: 1,
            windowStart: now,
            lastRequestTime: now
          }
        });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now.getTime() + (60 * 60 * 1000)
      };
    }

    if (record.requestCount >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.windowStart.getTime() + (60 * 60 * 1000)
      };
    }

    // Increment counter
    await db.update(faucetRateLimits)
      .set({
        requestCount: record.requestCount + 1,
        lastRequestTime: now
      })
      .where(and(
        eq(faucetRateLimits.identifier, identifierType === 'address' ? identifier.toLowerCase() : identifier),
        eq(faucetRateLimits.identifierType, identifierType)
      ));

    return {
      allowed: true,
      remaining: maxRequests - record.requestCount - 1,
      resetTime: record.windowStart.getTime() + (60 * 60 * 1000)
    };
  }

  private async checkCooldown(
    identifier: string,
    identifierType: 'address' | 'ip',
    now: Date
  ): Promise<{ allowed: boolean; remainingTime: number }> {
    const record = await db.query.faucetRateLimits.findFirst({
      where: and(
        eq(faucetRateLimits.identifier, identifierType === 'address' ? identifier.toLowerCase() : identifier),
        eq(faucetRateLimits.identifierType, identifierType)
      )
    });

    if (!record || !record.cooldownUntil || record.cooldownUntil <= now) {
      return {
        allowed: true,
        remainingTime: 0
      };
    }

    const remainingTime = record.cooldownUntil.getTime() - now.getTime();
    return {
      allowed: false,
      remainingTime
    };
  }
}