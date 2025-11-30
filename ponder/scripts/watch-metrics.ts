#!/usr/bin/env node

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INTERVAL_MS = 30 * 1000;
const CHECK_METRICS_SCRIPT = path.join(__dirname, 'check-metrics.ts');

console.log(`Starting metrics watch - will check every 30 seconds`);
console.log(`Press Ctrl+C to stop`);

runCheckMetrics();
setInterval(runCheckMetrics, INTERVAL_MS);

function runCheckMetrics(): void {
  console.log(`\n[${new Date().toISOString()}] Running metrics check...`);
  
  const child = spawn('node', ['--loader', 'ts-node/esm', CHECK_METRICS_SCRIPT], {
    stdio: 'inherit'
  });
  
  child.on('error', (error) => {
    console.error(`Error running check-metrics script: ${error.message}`);
  });
  
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`check-metrics script exited with code ${code}`);
    }
  });
}
