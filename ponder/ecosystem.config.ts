// Define PM2 config interface
interface Pm2AppConfig {
    name: string;
    script: string;
    args?: string;
    autorestart?: boolean;
    watch?: boolean | string[];
    restart_delay?: number;
    env?: Record<string, string>;
}

interface Pm2Config {
    apps: Pm2AppConfig[];
}

const config: Pm2Config = {
    apps: [
        {
            name: "ponder-pg",
            script: "./start-ponder-dev.sh",
            args: "42069 pg-ponder.config.ts",
            autorestart: true,
            watch: false,
            restart_delay: 2000,
            env: {
                NODE_ENV: "production"
            }
        },
        {
            name: "run-anvil",
            script: "./run-scalex-anvil.sh",
            args: "",
            autorestart: true,
            watch: false,
            restart_delay: 2000
        },
        {
            name: "metrics-dashboard",
            script: "node",
            args: "--import ./scripts/ts-register.js ./scripts/metrics-dashboard.ts",
            autorestart: true,
            watch: false,
            restart_delay: 3000,
            env: {
                NODE_ENV: "production"
            }
        },
        {
            name: "ws-stress-test",
            script: "tsx",
            args: "./websocket-client/stress-test.ts",
            autorestart: false,
            watch: false,
            env: {
                NODE_ENV: "production",
                WS_URL: "ws://localhost:42069/ws",
                CLIENT_COUNT: "50"
            }
        }
    ]
};

export default config;
