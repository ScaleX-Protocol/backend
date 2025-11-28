import { createConfig } from "ponder";
import { getCoreChainConfig } from "./core-chain-ponder.config";
import dotenv from "dotenv";

// Load core-chain-specific environment variables
dotenv.config({ path: ".env.core-chain" });

export default createConfig({
	database: {
		kind: "postgres",
		connectionString: process.env.PONDER_DATABASE_URL || "postgresql://postgres:password@localhost:5433/ponder_core",
	},
	...getCoreChainConfig(),
});