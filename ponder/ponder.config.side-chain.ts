import { createConfig } from "ponder";
import { getSideChainConfig } from "./side-chain-ponder.config";
import dotenv from "dotenv";

// Load side-anvil-specific environment variables
dotenv.config({ path: ".env.side-chain" });

export default createConfig({
	database: {
		kind: "postgres",
		connectionString: process.env.PONDER_DATABASE_URL || "postgresql://postgres:password@localhost:5433/ponder_side",
	},
	...getSideChainConfig(),
});