import { Elysia, t } from 'elysia';
import { ponderPool } from '../config/database';

// Helper: run a parameterized SQL query against the Ponder DB
async function runQuery<T extends object>(text: string, params: unknown[] = []): Promise<T[]> {
    const client = await ponderPool.connect();
    try {
        const result = await client.query<T>(text, params);
        return result.rows;
    } finally {
        client.release();
    }
}

// Calculate net positions from lending events
function calculatePositionsFromEvents(events: any[]): any[] {
    const positionMap = new Map<string, {
        collateralToken: string;
        debtToken: string;
        collateralAmount: bigint;
        debtAmount: bigint;
        suppliedAmount: bigint;
        borrowedAmount: bigint;
    }>();

    for (const event of events) {
        const token = event.token?.toLowerCase();
        if (!token) continue;

        let position = positionMap.get(token);
        if (!position) {
            position = {
                collateralToken: token,
                debtToken: token,
                collateralAmount: 0n,
                debtAmount: 0n,
                suppliedAmount: 0n,
                borrowedAmount: 0n
            };
            positionMap.set(token, position);
        }

        const amount = BigInt(event.amount || 0);

        switch (event.action) {
            case 'SUPPLY':
            case 'TRANSFER_IN':
                position.suppliedAmount += amount;
                position.collateralAmount += amount;
                break;
            case 'WITHDRAW':
            case 'TRANSFER_OUT':
                position.suppliedAmount -= amount;
                position.collateralAmount -= amount;
                break;
            case 'BORROW':
                position.borrowedAmount += amount;
                position.debtAmount += amount;
                break;
            case 'REPAY':
                position.borrowedAmount -= amount;
                position.debtAmount -= amount;
                break;
        }
    }

    // Filter out zero positions
    return Array.from(positionMap.values()).filter(p => p.suppliedAmount > 0n || p.borrowedAmount > 0n);
}

// Format amount from wei
function formatAmount(amount: string | bigint, decimals: number = 18): string {
    const amountStr = amount.toString();
    if (amountStr === '0') return '0';
    
    if (amountStr.length <= decimals) {
        return '0.' + '0'.repeat(decimals - amountStr.length) + amountStr;
    }
    
    const integerPart = amountStr.slice(0, amountStr.length - decimals);
    const decimalPart = amountStr.slice(-decimals).replace(/\.?0+$/, '');
    
    return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
}

// Format symbol
function formatSymbol(symbol: string): string {
    if (!symbol) return 'UNKNOWN';
    // Remove x prefix if present (e.g., xETH -> ETH)
    return symbol.startsWith('x') ? symbol.slice(1) : symbol;
}

export const lendingRoutes = new Elysia({ prefix: '/api' })
    .get('/lending/dashboard/:user', async (ctx) => {
        try {
            const { user } = ctx.params;
            const chainId = ctx.query?.chainId ? parseInt(ctx.query.chainId as string) : 84532;

            if (!user) {
                ctx.set.status = 400;
                return { error: "User address is required" };
            }

            // Get user's lending events
            const userLendingEvents = await runQuery<any>(`
                SELECT DISTINCT ON (id, "chainId", "userAddress", action, token, amount, "timestamp", "transactionId", "blockNumber")
                    "chainId", "userAddress", action, token, amount, "collateralToken", "debtToken", 
                    "healthFactor", "timestamp", "transactionId", "blockNumber", liquidator, "liquidatedAmount", "agentTokenId", executor
                FROM lending_events
                WHERE LOWER("userAddress") = LOWER($1) AND "chainId" = $2
                ORDER BY id, "chainId", "userAddress", action, token, amount, "timestamp", "transactionId", "blockNumber"
            `, [user, chainId]);

            // Calculate net positions from events
            const calculatedPositions = calculatePositionsFromEvents(userLendingEvents);

            // Get pool lending stats
            const poolStats = await runQuery<any>(`
                SELECT DISTINCT ON (token, "chainId")
                    token, "totalSupply", "totalBorrow", "supplyRate", "borrowRate", "utilizationRate"
                FROM pool_lending_stats
                WHERE "chainId" = $1
            `, [chainId]);

            // Get asset configurations
            const assetConfigs = await runQuery<any>(`
                SELECT DISTINCT ON (token, "chainId")
                    token, "collateralFactor", "liquidationThreshold", "liquidationBonus", "reserveFactor", "isActive", "timestamp"
                FROM asset_configurations
                WHERE "chainId" = $1 AND "isActive" = true
            `, [chainId]);

            // Get interest rate parameters
            const interestRateParams = await runQuery<any>(`
                SELECT DISTINCT ON (token, "chainId")
                    token, "baseRate", "optimalUtilization", "rateSlope1", "rateSlope2", "timestamp", "isActive"
                FROM interest_rate_parameters
                WHERE "chainId" = $1 AND "isActive" = true
            `, [chainId]);

            // Get user activity history
            const activityHistory = await runQuery<any>(`
                SELECT DISTINCT ON (id, "timestamp", "transactionId")
                    action, token, amount, "timestamp", "blockNumber", "transactionId"
                FROM lending_events
                WHERE LOWER("userAddress") = LOWER($1) AND "chainId" = $2
                ORDER BY id, "timestamp" DESC, "transactionId" DESC
                LIMIT 50
            `, [user, chainId]);

            // Get indexed lending positions
            const indexedPositions = await runQuery<any>(`
                SELECT DISTINCT ON (id)
                    id, "collateralToken", "debtToken", "collateralAmount", "debtAmount", "lastUpdated", "isActive"
                FROM lending_positions
                WHERE LOWER("userAddress") = LOWER($1) AND "chainId" = $2 AND "isActive" = true
            `, [user, chainId]);

            // Get currencies for token info
            const currencies = await runQuery<any>(`
                SELECT DISTINCT ON (address, "chainId")
                    address, symbol, decimals, name
                FROM currencies
                WHERE "chainId" = $1
            `, [chainId]);

            // Create maps for efficient lookup
            const currencyMap = new Map();
            currencies.forEach((c: any) => {
                currencyMap.set(c.address?.toLowerCase(), c);
            });

            const ratesMap = new Map();
            poolStats.forEach((stat: any) => {
                const tokenLower = stat.token?.toLowerCase();
                ratesMap.set(tokenLower, {
                    supplyRate: Number(stat.supplyRate || 0),
                    borrowRate: Number(stat.borrowRate || 0),
                    utilizationRate: Number(stat.utilizationRate || 0),
                });
            });

            const assetConfigMap = new Map();
            assetConfigs.forEach((config: any) => {
                const tokenLower = config.token?.toLowerCase();
                assetConfigMap.set(tokenLower, {
                    collateralFactor: Number(config.collateralFactor || 0) / 10000,
                    liquidationThreshold: Number(config.liquidationThreshold || 0) / 10000,
                    liquidationBonus: Number(config.liquidationBonus || 0) / 10000,
                    reserveFactor: Number(config.reserveFactor || 0) / 10000,
                });
            });

            const interestRateMap = new Map();
            interestRateParams.forEach((param: any) => {
                const tokenLower = param.token?.toLowerCase();
                interestRateMap.set(tokenLower, {
                    baseRate: Number(param.baseRate || 0),
                    optimalUtilization: Number(param.optimalUtilization || 0),
                    rateSlope1: Number(param.rateSlope1 || 0),
                    rateSlope2: Number(param.rateSlope2 || 0),
                    lastUpdated: param.timestamp,
                });
            });

            // Build supplies list
            const supplies = calculatedPositions
                .filter(p => p.suppliedAmount > 0n)
                .map(position => {
                    const token = position.collateralToken;
                    const currency = currencyMap.get(token) || { decimals: 18, symbol: 'UNKNOWN', name: 'Unknown' };
                    const rates = ratesMap.get(token) || { supplyRate: 0, utilizationRate: 0 };
                    const config = assetConfigMap.get(token) || { collateralFactor: 0 };

                    return {
                        id: `supply-${token}`,
                        asset: formatSymbol(currency.symbol),
                        assetAddress: token,
                        suppliedAmount: formatAmount(position.suppliedAmount, currency.decimals),
                        currentValue: '0', // Would need price feed
                        apy: (rates.supplyRate / 100).toString(),
                        earnings: '0',
                        projectedEarnings: {
                            hourly: '0',
                            daily: '0',
                            weekly: '0',
                            monthly: '0'
                        },
                        accruedYield: {
                            amount: '0',
                            value: '0',
                            sinceTimestamp: 0,
                            duration: '0'
                        },
                        canWithdraw: true,
                        collateralUsed: '0',
                        utilizationRate: (rates.utilizationRate / 10000).toString(),
                        realTimeRates: {
                            supplyAPY: (rates.supplyRate / 100).toString(),
                            borrowAPY: '0',
                            utilizationRate: (rates.utilizationRate / 10000).toString()
                        }
                    };
                });

            // Build borrows list
            const borrows = calculatedPositions
                .filter(p => p.borrowedAmount > 0n)
                .map(position => {
                    const token = position.debtToken;
                    const currency = currencyMap.get(token) || { decimals: 18, symbol: 'UNKNOWN', name: 'Unknown' };
                    const rates = ratesMap.get(token) || { borrowRate: 0 };
                    const config = assetConfigMap.get(token) || { collateralFactor: 0, liquidationThreshold: 0 };

                    return {
                        id: `borrow-${token}`,
                        asset: formatSymbol(currency.symbol),
                        assetAddress: token,
                        borrowedAmount: formatAmount(position.borrowedAmount, currency.decimals),
                        currentDebt: formatAmount(position.borrowedAmount, currency.decimals),
                        apy: (rates.borrowRate / 100).toString(),
                        interestAccrued: '0',
                        accruedInterest: {
                            amount: '0',
                            value: '0',
                            sinceTimestamp: 0,
                            duration: '0'
                        },
                        collateralRatio: '0',
                        healthFactor: '0',
                        healthStatus: 'safe' as const,
                        canRepay: true
                    };
                });

            // Build availableToSupply
            const availableToSupply = poolStats.map((stat: any) => {
                const token = stat.token?.toLowerCase();
                const currency = currencyMap.get(token) || { decimals: 18, symbol: 'UNKNOWN', name: 'Unknown' };
                const config = assetConfigMap.get(token);

                return {
                    asset: formatSymbol(currency.symbol),
                    assetAddress: token,
                    userBalance: '0',
                    suppliedAmount: formatAmount(stat.totalSupply, currency.decimals),
                    availableAmount: formatAmount(BigInt(Number(stat.totalSupply) - Number(stat.totalBorrow)), currency.decimals),
                    apy: (Number(stat.supplyRate) / 100).toString(),
                    utilizationRate: (Number(stat.utilizationRate) / 10000).toString(),
                    projectedEarnings: null,
                    canSupply: true,
                    realTimeRates: null
                };
            });

            // Build availableToBorrow
            const availableToBorrow = poolStats.map((stat: any) => {
                const token = stat.token?.toLowerCase();
                const currency = currencyMap.get(token) || { decimals: 18, symbol: 'UNKNOWN', name: 'Unknown' };
                const config = assetConfigMap.get(token);

                return {
                    asset: formatSymbol(currency.symbol),
                    assetAddress: token,
                    availableAmount: formatAmount(BigInt(Number(stat.totalSupply) - Number(stat.totalBorrow)), currency.decimals),
                    availableLiquidity: formatAmount(BigInt(Number(stat.totalSupply) - Number(stat.totalBorrow)), currency.decimals),
                    currentBorrowed: formatAmount(stat.totalBorrow, currency.decimals),
                    apy: (Number(stat.borrowRate) / 100).toString(),
                    utilizationRate: (Number(stat.utilizationRate) / 10000).toString(),
                    projectedInterest: null,
                    collateralFactor: config?.collateralFactor?.toString() || '0',
                    liquidationThreshold: config?.liquidationThreshold?.toString() || '0',
                    canBorrow: true,
                    recommended: false,
                    realTimeRates: null
                };
            });

            // Format activity history
            const formattedActivityHistory = activityHistory.map((activity: any) => {
                const currency = currencyMap.get(activity.token?.toLowerCase()) || { decimals: 18, symbol: 'UNKNOWN' };
                return {
                    action: activity.action,
                    amount: formatAmount(activity.amount, currency.decimals),
                    token: formatSymbol(currency.symbol),
                    tokenAddress: activity.token,
                    timestamp: activity.timestamp,
                    blockNumber: activity.blockNumber?.toString() || '0',
                    transactionId: activity.transactionId,
                    createdAt: new Date(activity.timestamp * 1000).toISOString()
                };
            });

            // Format interest rate params
            const formattedInterestRateParams = interestRateParams.map((param: any) => {
                const currency = currencyMap.get(param.token?.toLowerCase()) || { symbol: 'UNKNOWN' };
                return {
                    token: formatSymbol(currency.symbol),
                    tokenAddress: param.token,
                    baseRate: param.baseRate?.toString() || '0',
                    optimalUtilization: param.optimalUtilization?.toString() || '0',
                    rateSlope1: param.rateSlope1?.toString() || '0',
                    rateSlope2: param.rateSlope2?.toString() || '0',
                    lastUpdated: param.timestamp?.toString() || '0'
                };
            });

            // Format asset configurations
            const formattedAssetConfigs = assetConfigs.map((config: any) => {
                const currency = currencyMap.get(config.token?.toLowerCase()) || { symbol: 'UNKNOWN' };
                return {
                    token: formatSymbol(currency.symbol),
                    tokenAddress: config.token,
                    collateralFactor: (Number(config.collateralFactor) / 10000).toString(),
                    liquidationThreshold: (Number(config.liquidationThreshold) / 10000).toString(),
                    liquidationBonus: (Number(config.liquidationBonus) / 10000).toString(),
                    reserveFactor: (Number(config.reserveFactor) / 10000).toString(),
                    isActive: config.isActive,
                    lastUpdated: config.timestamp?.toString() || '0'
                };
            });

            // Calculate summary
            const totalSupplied = supplies.reduce((sum, s) => sum + Number(s.suppliedAmount), 0);
            const totalBorrowed = borrows.reduce((sum, b) => sum + Number(b.borrowedAmount), 0);

            const summary = {
                totalSupplied: totalSupplied.toString(),
                totalBorrowed: totalBorrowed.toString(),
                netAPY: '0',
                totalEarnings: '0',
                healthFactor: '0',
                borrowingPower: '0'
            };

            return {
                success: true,
                data: {
                    supplies,
                    borrows,
                    availableToSupply,
                    availableToBorrow,
                    activityHistory: formattedActivityHistory,
                    interestRateParams: formattedInterestRateParams,
                    assetConfigurations: formattedAssetConfigs,
                    summary
                }
            };
        } catch (error) {
            console.error('Error fetching lending dashboard:', error);
            ctx.set.status = 500;
            return { success: false, error: `Failed to fetch lending dashboard: ${error}` };
        }
    }, {
        detail: {
            summary: 'Get lending dashboard',
            description: 'Get lending positions, supplies, borrows, and activity for a user',
            tags: ['Lending'],
        },
    });
