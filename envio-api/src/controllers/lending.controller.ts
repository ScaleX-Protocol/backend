import { Context } from 'elysia';
import { HttpStatus } from '../enums';

export class LendingController {
  static async getLendingDashboard({ params, query, set }: Context) {
    try {
      const { user } = params;
      const chainId = query.chainId ? parseInt(query.chainId as string) : 84532;

      if (!user) {
        set.status = HttpStatus.BAD_REQUEST;
        return { error: 'User parameter is required' };
      }

      // Mock lending data - should be implemented with actual database queries
      const mockSupplies = [
        {
          id: 'supply-1',
          asset: 'USDC',
          assetAddress: '0x1234567890123456789012345678901234567890',
          suppliedAmount: '1000.00',
          currentValue: '$1,000.00',
          apy: '3.5%',
          earnings: '$12.50',
          canWithdraw: true,
          collateralUsed: '1000.00'
        },
        {
          id: 'supply-2',
          asset: 'WETH',
          assetAddress: '0xABCDEF1234567890123456789012345678901234',
          suppliedAmount: '2.5',
          currentValue: '$7,500.00',
          apy: '2.8%',
          earnings: '$45.20',
          canWithdraw: true,
          collateralUsed: '2000.00'
        }
      ];

      const mockBorrows = [
        {
          id: 'borrow-1',
          asset: 'USDC',
          assetAddress: '0x1234567890123456789012345678901234567890',
          borrowedAmount: '500.00',
          currentDebt: '$510.25',
          apy: '4.2%',
          interestAccrued: '$10.25',
          collateralRatio: '150',
          healthFactor: '1.85',
          healthStatus: 'safe' as const,
          canRepay: true
        }
      ];

      const mockAvailableToSupply = [
        {
          asset: 'USDC',
          assetAddress: '0x1234567890123456789012345678901234567890',
          userBalance: '5000.00',
          suppliedAmount: '1000.00',
          availableAmount: '4000.00',
          apy: '3.5%',
          canSupply: true,
          recommended: true
        },
        {
          asset: 'WETH',
          assetAddress: '0xABCDEF1234567890123456789012345678901234',
          userBalance: '10.0',
          suppliedAmount: '2.5',
          availableAmount: '7.5',
          apy: '2.8%',
          canSupply: true,
          recommended: false
        }
      ];

      const mockAvailableToBorrow = [
        {
          asset: 'USDC',
          assetAddress: '0x1234567890123456789012345678901234567890',
          availableAmount: '1600.00',
          currentBorrowed: '500.00',
          apy: '4.2%',
          collateralFactor: '80',
          liquidationThreshold: '85',
          canBorrow: true,
          recommended: true
        },
        {
          asset: 'WETH',
          assetAddress: '0xABCDEF1234567890123456789012345678901234',
          availableAmount: '0.5',
          currentBorrowed: '0.0',
          apy: '3.9%',
          collateralFactor: '75',
          liquidationThreshold: '80',
          canBorrow: true,
          recommended: false
        }
      ];

      const mockSummary = {
        totalSupplied: '8500.00',
        totalBorrowed: '510.25',
        netAPY: '3.2',
        totalEarnings: '57.70',
        healthFactor: '1.85',
        borrowingPower: '6400.00'
      };

      return {
        supplies: mockSupplies,
        borrows: mockBorrows,
        availableToSupply: mockAvailableToSupply,
        availableToBorrow: mockAvailableToBorrow,
        summary: mockSummary
      };
    } catch (error) {
      set.status = HttpStatus.INTERNAL_SERVER_ERROR;
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}