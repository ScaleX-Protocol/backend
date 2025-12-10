-- Migration: Change faucet_requests.amount from bigint to numeric
-- Reason: bigint max value (~9.2e18) is too small for tokens with 18 decimals
-- Example: 1000 WETH = 1e21 which overflows bigint

ALTER TABLE "faucet_requests" ALTER COLUMN "amount" TYPE numeric USING amount::numeric;
