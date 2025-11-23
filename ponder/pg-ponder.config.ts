import { createConfig } from "ponder";
import { getBaseConfig } from "./base-ponder.config";
import * as fs from "node:fs";
import dotenv from "dotenv";

dotenv.config();

const caPath = process.env.PONDER_DATABASE_CA;
const ssl: Record<string, unknown> = {};

if (caPath && fs.existsSync(caPath)) {
	ssl.ca = fs.readFileSync(caPath).toString();
}

export default createConfig({
	database: {
		kind: "postgres",
		connectionString: process.env.PONDER_DATABASE_URL,
		poolConfig: Object.keys(ssl).length ? { ssl } : undefined,
	},
	...getBaseConfig(),
});
