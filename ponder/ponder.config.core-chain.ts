import { createConfig } from "ponder";
import { getCoreChainConfig } from "./core-chain-ponder.config";
import dotenv from "dotenv";

// Load core-chain-specific environment variables as fallback defaults.
// override: false ensures Docker-injected env vars take precedence over the file.
dotenv.config({ path: ".env.core-chain", override: false });

export default createConfig({
	database: {
		kind: "postgres",
		connectionString: process.env.PONDER_DATABASE_URL || "postgresql://postgres:password@localhost:5433/ponder_core",
	},
	...getCoreChainConfig(),
});