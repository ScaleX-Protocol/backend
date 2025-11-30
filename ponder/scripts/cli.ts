#!/usr/bin/env tsx

import { spawn, ChildProcess } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';

interface MenuItem {
  name: string;
  value: string;
  description: string;
  command: string;
  dangerous?: boolean;
}

interface MenuCategory {
  title: string;
  emoji: string;
  items: MenuItem[];
}

const menuCategories: MenuCategory[] = [
  {
    title: 'Infrastructure Only',
    emoji: '🗄️',
    items: [
      {
        name: 'Start Core Infrastructure',
        value: 'infra-core',
        description: 'Start PostgreSQL and Redis only (minimal setup)',
        command: 'docker-compose -f ../docker-compose.yml up -d postgres redis'
      },
      {
        name: 'Start Full Infrastructure',
        value: 'infra-full',
        description: 'Start databases + monitoring (Prometheus, Grafana, Redis Commander)',
        command: 'docker-compose -f ../docker-compose.yml up -d postgres redis prometheus grafana redis-commander'
      },
      {
        name: 'Stop Infrastructure',
        value: 'infra-stop',
        description: 'Stop all infrastructure containers',
        command: 'docker-compose -f ../docker-compose.yml down'
      },
      {
        name: 'Infrastructure Status',
        value: 'infra-status',
        description: 'Check infrastructure container status',
        command: 'docker-compose -f ../docker-compose.yml ps postgres redis prometheus grafana redis-commander'
      },
      {
        name: 'Reset Databases (Dangerous)',
        value: 'infra-reset',
        description: 'Stop infrastructure and remove all data volumes',
        command: 'docker-compose -f ../docker-compose.yml down -v',
        dangerous: true
      }
    ]
  },
  {
    title: 'Local Services (Hybrid Dev)',
    emoji: '💻',
    items: [
      {
        name: 'Run All Services Locally',
        value: 'local-all',
        description: 'Run indexer, websocket, and analytics services locally in parallel',
        command: 'local-services-all'
      },
      {
        name: 'Run Indexer Only',
        value: 'local-indexer',
        description: 'Run the core CLOB indexer service locally',
        command: 'npm run dev'
      },
      {
        name: 'Run WebSocket Service',
        value: 'local-websocket',
        description: 'Run the WebSocket service locally',
        command: 'cd websocket-service && npm run dev'
      },
      {
        name: 'Run Analytics Service',
        value: 'local-analytics',
        description: 'Run the Analytics service locally',
        command: 'cd ../analytics-service && npm run dev'
      },
      {
        name: 'Install All Dependencies',
        value: 'local-install',
        description: 'Install dependencies for all services',
        command: 'npm install && cd ../websocket-service && npm install && cd ../analytics-service && npm install && cd ../scripts'
      }
    ]
  },
  {
    title: 'Microservices (Docker)',
    emoji: '🏗️',
    items: [
      {
        name: 'Setup Environment',
        value: 'ms-setup',
        description: 'Setup environment files and dependencies for all services',
        command: './scripts/microservices.sh setup'
      },
      {
        name: 'Build All Services',
        value: 'ms-build',
        description: 'Build all microservices (WebSocket, Analytics)',
        command: './scripts/microservices.sh build'
      },
      {
        name: 'Start All Services',
        value: 'ms-start',
        description: 'Start complete microservices stack',
        command: './scripts/microservices.sh start'
      },
      {
        name: 'Start Development Mode',
        value: 'ms-dev',
        description: 'Start all services with development tools (Redis Commander)',
        command: './scripts/microservices.sh dev'
      },
      {
        name: 'Stop All Services',
        value: 'ms-stop',
        description: 'Stop all microservices',
        command: './scripts/microservices.sh stop'
      },
      {
        name: 'Restart All Services',
        value: 'ms-restart',
        description: 'Restart all microservices',
        command: './scripts/microservices.sh restart'
      },
      {
        name: 'Service Status & Health',
        value: 'ms-status',
        description: 'Check status and health of all services',
        command: './scripts/microservices.sh status'
      },
      {
        name: 'View All Logs',
        value: 'ms-logs',
        description: 'View logs from all services',
        command: './scripts/microservices.sh logs'
      },
      {
        name: 'Clean Up (Dangerous)',
        value: 'ms-clean',
        description: 'Stop services and remove all volumes/containers',
        command: './scripts/microservices.sh clean',
        dangerous: true
      }
    ]
  },
  {
    title: 'Development',
    emoji: '🚀',
    items: [
      {
        name: 'Start Development Server',
        value: 'dev',
        description: 'Start Ponder in development mode with hot reload',
        command: 'pnpm dev'
      },
      {
        name: 'Start Production Server',
        value: 'start',
        description: 'Start Ponder in production mode',
        command: 'pnpm start'
      },
      {
        name: 'Generate Code',
        value: 'codegen',
        description: 'Generate TypeScript code from schema and config',
        command: 'pnpm codegen'
      }
    ]
  },
  {
    title: 'Database',
    emoji: '🗄️',
    items: [
      {
        name: 'Database Operations',
        value: 'db',
        description: 'Run Ponder database operations (migrate, reset, etc.)',
        command: 'pnpm db'
      }
    ]
  },
  {
    title: 'Code Quality',
    emoji: '✨',
    items: [
      {
        name: 'Lint Code',
        value: 'lint',
        description: 'Run ESLint to check for code quality issues',
        command: 'pnpm lint'
      },
      {
        name: 'Type Check',
        value: 'typecheck',
        description: 'Run TypeScript type checking',
        command: 'pnpm typecheck'
      }
    ]
  },
  {
    title: 'Monitoring & Debugging',
    emoji: '📊',
    items: [
      {
        name: 'Check Metrics',
        value: 'metrics',
        description: 'Check current system metrics',
        command: 'pnpm metrics'
      },
      {
        name: 'Start Metrics Monitor',
        value: 'metrics:start',
        description: 'Start the metrics monitoring system',
        command: 'pnpm metrics:start'
      },
      {
        name: 'Watch Metrics',
        value: 'metrics:watch',
        description: 'Watch metrics in real-time',
        command: 'pnpm metrics:watch'
      },
      {
        name: 'Metrics Dashboard',
        value: 'metrics:dashboard',
        description: 'Open the metrics dashboard',
        command: 'pnpm metrics:dashboard'
      },
      {
        name: 'System Monitor',
        value: 'monitor',
        description: 'Run system resource monitoring',
        command: 'pnpm monitor'
      },
      {
        name: 'Open Grafana Dashboard',
        value: 'open-grafana',
        description: 'Open Grafana monitoring dashboard (admin/admin)',
        command: 'open http://localhost:3000'
      },
      {
        name: 'Open Prometheus',
        value: 'open-prometheus',
        description: 'Open Prometheus metrics collection',
        command: 'open http://localhost:9090'
      },
      {
        name: 'Open Redis Commander',
        value: 'open-redis-commander',
        description: 'Open Redis Commander for debugging streams',
        command: 'open http://localhost:8081'
      },
      {
        name: 'Redis CLI Access',
        value: 'redis-cli',
        description: 'Access Redis CLI for debugging',
        command: 'docker-compose -f docker-compose.yml exec redis redis-cli'
      },
      {
        name: 'PostgreSQL CLI Access',
        value: 'postgres-cli',
        description: 'Access PostgreSQL CLI for database queries',
        command: 'docker-compose -f docker-compose.yml exec postgres psql -U postgres -d ponder'
      }
    ]
  },
  {
    title: 'API Testing',
    emoji: '🔌',
    items: [
      {
        name: 'Test WebSocket Health',
        value: 'test-ws-health',
        description: 'Test WebSocket service health endpoint',
        command: 'curl -s http://localhost:8080/health | jq'
      },
      {
        name: 'Test Analytics Health',
        value: 'test-analytics-health',
        description: 'Test Analytics service health endpoint',
        command: 'curl -s http://localhost:3001/health | jq'
      },
      {
        name: 'Test Market Overview',
        value: 'test-market-overview',
        description: 'Test market overview analytics API',
        command: 'curl -s http://localhost:3001/api/market/overview | jq'
      },
      {
        name: 'Test Portfolio API',
        value: 'test-portfolio',
        description: 'Test portfolio API (requires wallet address input)',
        command: 'echo "Usage: curl -s http://localhost:3001/api/portfolio/{address} | jq"'
      },
      {
        name: 'Test All Analytics APIs',
        value: 'test-all-analytics',
        description: 'Test all analytics API endpoints',
        command: 'echo "Testing all analytics endpoints..." && curl -s http://localhost:3001/api/market/overview | jq && curl -s http://localhost:3001/api/market/volume | jq && curl -s http://localhost:3001/api/market/liquidity | jq'
      }
    ]
  },
  {
    title: 'Redis Streams Monitoring',
    emoji: '🔄',
    items: [
      {
        name: 'WebSocket Service Monitor',
        value: 'websocket-monitor',
        description: 'Monitor WebSocket service consumption only (websocket-consumers)',
        command: 'npm run stream-monitor -- websocket'
      },
      {
        name: 'Analytics Service Monitor',
        value: 'analytics-monitor',
        description: 'Monitor Analytics service consumption only (analytics-consumers)',
        command: 'npm run stream-monitor -- analytics'
      },
      {
        name: 'WebSocket Real-time Monitor',
        value: 'websocket-watch',
        description: 'Real-time WebSocket service monitoring with auto-refresh',
        command: 'npm run stream-monitor -- websocket --watch'
      },
      {
        name: 'Analytics Real-time Monitor',
        value: 'analytics-watch',
        description: 'Real-time Analytics service monitoring with auto-refresh',
        command: 'npm run stream-monitor -- analytics --watch'
      },
      {
        name: 'All Streams Overview',
        value: 'streams-overview',
        description: 'Show overview of all Redis streams (combined view)',
        command: 'npm run stream-monitor -- overview'
      },
      {
        name: 'All Streams Real-time',
        value: 'streams-watch',
        description: 'Real-time monitoring of all streams with auto-refresh',
        command: 'npm run stream-monitor -- watch'
      },
      {
        name: 'Stream Details',
        value: 'stream-details',
        description: 'Detailed information about a specific stream',
        command: 'stream-monitor-details'
      },
      {
        name: 'Consumer Analysis',
        value: 'consumer-analysis',
        description: 'Analyze consumer performance and health',
        command: 'stream-monitor-consumers'
      },
      {
        name: 'Pending Messages',
        value: 'pending-messages',
        description: 'View pending messages and identify bottlenecks',
        command: 'stream-monitor-pending'
      }
    ]
  },
  {
    title: 'Simulation & Testing',
    emoji: '🧪',
    items: [
      {
        name: 'WebSocket Client',
        value: 'ws-client',
        description: 'Run the WebSocket client for testing connections',
        command: 'pnpm ws-client'
      },
      {
        name: 'WebSocket Stress Test',
        value: 'ws-stress-test',
        description: 'Run WebSocket stress testing with configurable parameters',
        command: 'pnpm ws-stress-test'
      },
      {
        name: 'Simulate Market Data',
        value: 'simulate-market',
        description: 'Run real trading simulation to generate WebSocket messages',
        command: 'pnpm simulate-market'
      }
    ]
  }
];

class CLI {
  private currentCategory: MenuCategory | null = null;

  constructor() {
    this.setupExitHandlers();
  }

  private setupExitHandlers(): void {
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\n👋 Goodbye!'));
      process.exit(0);
    });
  }

  private displayHeader(): void {
    console.clear();
    console.log(chalk.cyan.bold('╔══════════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║') + '  ' + chalk.white.bold('ScaleX Indexer Development CLI') + '                 ' + chalk.cyan.bold('║'));
    console.log(chalk.cyan.bold('╚══════════════════════════════════════════════╝'));
    console.log();
  }

  private async showMainMenu(): Promise<void> {
    this.displayHeader();

    const choices = menuCategories.map(category => ({
      name: `${category.emoji} ${category.title}`,
      value: category.title,
      short: category.title
    }));

    choices.push(
      { name: '───────────────────', value: 'separator', short: '' },
      { name: '🚪 Exit', value: 'exit', short: 'Exit' }
    );

    const { selectedCategory } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedCategory',
        message: 'Select a category:',
        choices,
        pageSize: 10
      }
    ]);

    if (selectedCategory === 'exit') {
      console.log(chalk.green('👋 Goodbye!'));
      process.exit(0);
    }

    if (selectedCategory === 'separator') {
      return this.showMainMenu();
    }

    const category = menuCategories.find(cat => cat.title === selectedCategory);
    if (category) {
      this.currentCategory = category;
      await this.showCategoryMenu(category);
    }
  }

  private async showCategoryMenu(category: MenuCategory): Promise<void> {
    this.displayHeader();
    console.log(chalk.blue.bold(`${category.emoji} ${category.title} Commands\n`));

    const choices = category.items.map(item => ({
      name: item.dangerous
        ? chalk.red(`${item.name} - ${item.description}`)
        : `${item.name} - ${chalk.gray(item.description)}`,
      value: item.value,
      short: item.name
    }));

    choices.push(
      { name: '───────────────────', value: 'separator', short: '' },
      { name: '🔙 Back to Main Menu', value: 'back', short: 'Back' },
      { name: '🚪 Exit', value: 'exit', short: 'Exit' }
    );

    const { selectedCommand } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedCommand',
        message: 'Select a command:',
        choices,
        pageSize: 15
      }
    ]);

    if (selectedCommand === 'exit') {
      console.log(chalk.green('👋 Goodbye!'));
      process.exit(0);
    }

    if (selectedCommand === 'back') {
      return this.showMainMenu();
    }

    if (selectedCommand === 'separator') {
      return this.showCategoryMenu(category);
    }

    const menuItem = category.items.find(item => item.value === selectedCommand);
    if (menuItem) {
      await this.executeCommand(menuItem);
    }
  }

  private async executeCommand(menuItem: MenuItem): Promise<void> {
    // Special handling for WebSocket stress test
    if (menuItem.value === 'ws-stress-test') {
      await this.executeStressTest();
      return;
    }

    // Special handling for portfolio API test (requires user input)
    if (menuItem.value === 'test-portfolio') {
      await this.executePortfolioTest();
      return;
    }

    // Special handling for running all services locally
    if (menuItem.value === 'local-all') {
      await this.executeLocalServices();
      return;
    }

    // Special handling for stream monitoring commands
    if (menuItem.value.startsWith('streams-') || menuItem.value.startsWith('stream-') ||
      menuItem.value.startsWith('websocket-') || menuItem.value.startsWith('analytics-')) {
      await this.executeStreamMonitorCommand(menuItem);
      return;
    }

    // Show confirmation for dangerous commands
    if (menuItem.dangerous) {
      console.log(chalk.red.bold('\n⚠️  WARNING: This is a destructive operation!'));
      console.log(chalk.yellow(`Command: ${menuItem.command}`));
      console.log(chalk.yellow(`Description: ${menuItem.description}\n`));

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to proceed?',
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Operation cancelled.\n'));
        await this.showPostCommandMenu();
        return;
      }
    }

    console.log(chalk.blue(`\n🚀 Executing: ${chalk.white.bold(menuItem.command)}\n`));

    // Handle microservices commands with flexible paths
    let command = menuItem.command;
    if (command.includes('./scripts/microservices.sh')) {
      // Detect if we're running from scripts directory or project root
      const fs = await import('fs');
      if (fs.existsSync('./microservices.sh')) {
        // Running from scripts directory
        command = command.replace('./scripts/microservices.sh', './microservices.sh');
      } else if (fs.existsSync('../scripts/microservices.sh')) {
        // Running from project root, but script is in scripts directory
        command = command.replace('./scripts/microservices.sh', './scripts/microservices.sh');
      }
    }

    const [cmd, ...args] = command.split(' ');

    return new Promise((resolve) => {
      const child: ChildProcess = spawn(cmd || '', args, {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code: number | null) => {
        console.log();
        if (code === 0) {
          console.log(chalk.green('✅ Command completed successfully!'));
        } else {
          console.log(chalk.red(`❌ Command failed with exit code ${code}`));
        }
        console.log();
        resolve(this.showPostCommandMenu());
      });

      child.on('error', (error: Error) => {
        console.log(chalk.red(`❌ Error executing command: ${error.message}`));
        resolve(this.showPostCommandMenu());
      });
    });
  }

  private async executeStreamMonitorCommand(menuItem: MenuItem): Promise<void> {
    const streamNames = ['trades', 'balances', 'orders', 'depth', 'klines', 'execution_reports'];
    const consumerGroups = ['websocket-consumers', 'analytics-consumers'];

    switch (menuItem.value) {
      case 'streams-overview':
        console.log(chalk.blue(`\n🚀 Executing: ${chalk.white.bold(menuItem.command)}\n`));
        break;

      case 'websocket-monitor':
        console.log(chalk.blue.bold('\n🔌 WebSocket Service Monitoring\n'));
        console.log(chalk.cyan('Showing consumption metrics for websocket-consumers group only...\n'));
        break;

      case 'analytics-monitor':
        console.log(chalk.blue.bold('\n📊 Analytics Service Monitoring\n'));
        console.log(chalk.cyan('Showing consumption metrics for analytics-consumers group only...\n'));
        break;

      case 'websocket-watch':
        console.log(chalk.blue.bold('\n🔌 WebSocket Service Real-time Monitoring\n'));
        console.log(chalk.cyan('Starting real-time monitoring for websocket-consumers...\n'));
        console.log(chalk.yellow('💡 Press Ctrl+C to stop monitoring\n'));
        return this.executeWatchCommand(menuItem.command);

      case 'analytics-watch':
        console.log(chalk.blue.bold('\n📊 Analytics Service Real-time Monitoring\n'));
        console.log(chalk.cyan('Starting real-time monitoring for analytics-consumers...\n'));
        console.log(chalk.yellow('💡 Press Ctrl+C to stop monitoring\n'));
        return this.executeWatchCommand(menuItem.command);

      case 'streams-watch':
        console.log(chalk.blue.bold('\n🔄 Real-time Stream Monitoring\n'));

        const { watchInterval } = await inquirer.prompt([
          {
            type: 'input',
            name: 'watchInterval',
            message: 'Update interval (seconds):',
            default: '5',
            validate: (input: string) => {
              const num = parseInt(input);
              if (isNaN(num) || num < 1) {
                return 'Please enter a valid number greater than 0';
              }
              return true;
            }
          }
        ]);

        console.log(chalk.blue(`\n🚀 Starting real-time monitoring (${watchInterval}s intervals)\n`));
        console.log(chalk.yellow('💡 Press Ctrl+C to stop monitoring\n'));

        return this.executeWatchCommand(`npm run stream-monitor watch --interval ${watchInterval}`);

      case 'stream-details':
        console.log(chalk.blue.bold('\n📋 Stream Details Analysis\n'));

        const { selectedStream } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedStream',
            message: 'Select stream to analyze:',
            choices: streamNames.map(name => ({
              name: `${name} - ${this.getStreamDescription(name)}`,
              value: name
            }))
          }
        ]);

        return this.executeStreamCommand(`npm run stream-monitor stream ${selectedStream}`);

      case 'consumer-analysis':
        console.log(chalk.blue.bold('\n👥 Consumer Analysis\n'));

        const consumerAnswers = await inquirer.prompt([
          {
            type: 'list',
            name: 'stream',
            message: 'Select stream:',
            choices: streamNames
          },
          {
            type: 'list',
            name: 'group',
            message: 'Select consumer group:',
            choices: consumerGroups
          }
        ]);

        return this.executeStreamCommand(`npm run stream-monitor consumers ${consumerAnswers.stream} ${consumerAnswers.group}`);

      case 'pending-messages':
        console.log(chalk.blue.bold('\n⏳ Pending Messages Analysis\n'));

        const pendingAnswers = await inquirer.prompt([
          {
            type: 'list',
            name: 'stream',
            message: 'Select stream:',
            choices: streamNames
          },
          {
            type: 'list',
            name: 'group',
            message: 'Select consumer group:',
            choices: consumerGroups
          },
          {
            type: 'confirm',
            name: 'specificConsumer',
            message: 'Filter by specific consumer?',
            default: false
          }
        ]);

        if (pendingAnswers.specificConsumer) {
          const { consumerName } = await inquirer.prompt([
            {
              type: 'input',
              name: 'consumerName',
              message: 'Enter consumer name:',
              validate: (input: string) => {
                if (!input.trim()) {
                  return 'Please enter a consumer name';
                }
                return true;
              }
            }
          ]);

          return this.executeStreamCommand(`npm run stream-monitor pending ${pendingAnswers.stream} ${pendingAnswers.group} --consumer ${consumerName}`);
        } else {
          return this.executeStreamCommand(`npm run stream-monitor pending ${pendingAnswers.stream} ${pendingAnswers.group}`);
        }

      case 'stream-health':
        console.log(chalk.blue.bold('\n🏥 Stream Health Check\n'));
        console.log(chalk.cyan('Running comprehensive health check on all streams...\n'));

        // Run overview first, then detailed checks
        return this.executeStreamCommand('npm run stream-monitor overview');

      default:
        return this.executeStreamCommand(menuItem.command);
    }

    return this.executeStreamCommand(menuItem.command);
  }

  private getStreamDescription(streamName: string): string {
    const descriptions: { [key: string]: string } = {
      'trades': 'Trade execution events',
      'balances': 'Balance update events',
      'orders': 'Order lifecycle events',
      'depth': 'Order book depth changes',
      'klines': 'Candlestick data updates',
      'execution_reports': 'User-specific execution reports'
    };
    return descriptions[streamName] || 'Stream data';
  }

  private async executeStreamCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.split(' ');

    return new Promise((resolve) => {
      const child: ChildProcess = spawn(cmd || '', args, {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code: number | null) => {
        console.log();
        if (code === 0) {
          console.log(chalk.green('✅ Stream monitoring completed successfully!'));
        } else {
          console.log(chalk.red(`❌ Stream monitoring failed with exit code ${code}`));
        }
        console.log();
        resolve(this.showPostCommandMenu());
      });

      child.on('error', (error: Error) => {
        console.log(chalk.red(`❌ Error executing stream monitor: ${error.message}`));
        resolve(this.showPostCommandMenu());
      });
    });
  }

  private async executeWatchCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.split(' ');

    return new Promise((resolve) => {
      const child: ChildProcess = spawn(cmd || '', args, {
        stdio: 'inherit',
        shell: true
      });

      // Handle Ctrl+C gracefully for watch commands
      const handleExit = async () => {
        console.log(chalk.yellow('\n\n👋 Stopping monitor...'));
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 2000);
        await this.showPostCommandMenu();
        resolve();
      };

      process.on('SIGINT', handleExit);

      child.on('close', (code: number | null) => {
        process.removeListener('SIGINT', handleExit);
        console.log();
        if (code === 0) {
          console.log(chalk.green('✅ Stream monitoring stopped successfully!'));
        } else if (code !== null) {
          console.log(chalk.yellow(`⚠️ Stream monitoring stopped with code ${code}`));
        }
        console.log();
        resolve(this.showPostCommandMenu());
      });

      child.on('error', (error: Error) => {
        process.removeListener('SIGINT', handleExit);
        console.log(chalk.red(`❌ Error executing stream monitor: ${error.message}`));
        resolve(this.showPostCommandMenu());
      });
    });
  }

  private async executeStressTest(): Promise<void> {
    console.log(chalk.blue.bold('\n🔌 WebSocket Stress Test Configuration\n'));

    const answers = await (inquirer.prompt as any)([
      {
        type: 'input',
        name: 'numClients',
        message: 'Number of concurrent clients:',
        default: '10',
        validate: (input: string) => {
          const num = parseInt(input);
          if (isNaN(num) || num < 1) {
            return 'Please enter a valid number greater than 0';
          }
          if (num > 1000) {
            return 'Warning: Values over 1000 may impact system performance. Continue? (y/N)';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'url',
        message: 'WebSocket server URL:',
        default: 'wss://core-devnet.scalex.money'
      },
      {
        type: 'checkbox',
        name: 'streams',
        message: 'Select streams to subscribe to:',
        choices: [
          { name: 'gswethgsusdc@trade - Trade stream', value: 'gswethgsusdc@trade', checked: true },
          { name: 'gswethgsusdc@kline_1m - 1-minute kline', value: 'gswethgsusdc@kline_1m', checked: true },
          { name: 'gswethgsusdc@depth - Order book depth', value: 'gswethgsusdc@depth', checked: true },
          { name: 'gswethgsusdc@miniTicker - Mini ticker', value: 'gswethgsusdc@miniTicker', checked: true }
        ],
        validate: (choices: string[]) => {
          if (choices.length === 0) {
            return 'Please select at least one stream';
          }
          return true;
        }
      },
      {
        type: 'confirm',
        name: 'useUserSockets',
        message: 'Subscribe to user WebSocket connections as well?',
        default: true
      },
      {
        type: 'input',
        name: 'userFile',
        message: 'Path to user addresses file (one address per line):',
        default: './user-addresses.txt',
        when: (answers: any) => answers.useUserSockets,
        validate: async (input: string) => {
          try {
            const fs = await import('fs');
            if (!fs.existsSync(input)) {
              return `File ${input} does not exist. Please provide a valid file path.`;
            }
            return true;
          } catch {
            return 'Unable to validate file path';
          }
        }
      },
      {
        type: 'input',
        name: 'duration',
        message: 'Test duration in seconds (leave empty for unlimited):',
        default: '',
        validate: (input: string) => {
          if (input === '') return true;
          const num = parseInt(input);
          if (isNaN(num) || num < 1) {
            return 'Please enter a valid number greater than 0 or leave empty for unlimited';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'connectionDelay',
        message: 'Delay between client connections (ms):',
        default: '100',
        validate: (input: string) => {
          const num = parseInt(input);
          if (isNaN(num) || num < 0) {
            return 'Please enter a valid number greater than or equal to 0';
          }
          return true;
        }
      }
    ]);

    // Build command arguments
    const args = [
      '--clients', answers.numClients,
      '--url', answers.url,
      '--streams', answers.streams.join(','),
      '--delay', answers.connectionDelay
    ];

    if (answers.duration) {
      args.push('--duration', answers.duration);
    }

    if (answers.useUserSockets && answers.userFile) {
      args.push('--users', answers.userFile);
    }

    const fullCommand = `tsx ./websocket-client/stress-test.ts ${args.join(' ')}`;

    console.log(chalk.blue(`\n🚀 Executing: ${chalk.white.bold(fullCommand)}\n`));
    console.log(chalk.yellow('💡 Press Ctrl+C to stop the stress test\n'));

    // Show summary
    console.log(chalk.cyan('📋 Configuration Summary:'));
    console.log(`   Clients: ${chalk.white(answers.numClients)}`);
    console.log(`   URL: ${chalk.white(answers.url)}`);
    console.log(`   Streams: ${chalk.white(answers.streams.join(', '))}`);
    if (answers.useUserSockets) {
      console.log(`   User sockets: ${chalk.white('Yes')} (${answers.userFile})`);
    } else {
      console.log(`   User sockets: ${chalk.white('No')}`);
    }
    if (answers.duration) {
      console.log(`   Duration: ${chalk.white(answers.duration)}s`);
    } else {
      console.log(`   Duration: ${chalk.white('Unlimited')}`);
    }
    console.log(`   Connection delay: ${chalk.white(answers.connectionDelay)}ms\n`);

    return new Promise((resolve) => {
      const child: ChildProcess = spawn('tsx', ['./websocket-client/stress-test.ts', ...args], {
        stdio: 'inherit',
        shell: true
      });

      child.on('close', (code: number | null) => {
        console.log();
        if (code === 0) {
          console.log(chalk.green('✅ Stress test completed successfully!'));
        } else {
          console.log(chalk.red(`❌ Stress test failed with exit code ${code}`));
        }
        console.log();
        resolve(this.showPostCommandMenu());
      });

      child.on('error', (error: Error) => {
        console.log(chalk.red(`❌ Error executing stress test: ${error.message}`));
        resolve(this.showPostCommandMenu());
      });
    });
  }

  private async executePortfolioTest(): Promise<void> {
    console.log(chalk.blue.bold('\n💼 Portfolio API Test\n'));

    const { address } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Enter wallet address to test:',
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Please enter a wallet address';
          }
          if (!input.startsWith('0x') || input.length !== 42) {
            return 'Please enter a valid Ethereum address (0x followed by 40 hex characters)';
          }
          return true;
        }
      }
    ]);

    const commands = [
      `curl -s http://localhost:3001/api/portfolio/${address} | jq`,
      `curl -s http://localhost:3001/api/portfolio/${address}/performance | jq`,
      `curl -s http://localhost:3001/api/portfolio/${address}/allocation | jq`,
      `curl -s http://localhost:3001/api/portfolio/${address}/history | jq`
    ];

    console.log(chalk.blue(`\n🚀 Testing Portfolio APIs for: ${chalk.white.bold(address)}\n`));

    for (const command of commands) {
      console.log(chalk.cyan(`➤ ${command}`));

      const [cmd, ...args] = command.split(' ');

      await new Promise<void>((resolve) => {
        const child: ChildProcess = spawn(cmd || '', args, {
          stdio: 'inherit',
          shell: true
        });

        child.on('close', (code: number | null) => {
          console.log();
          if (code !== 0) {
            console.log(chalk.red(`❌ Command failed with exit code ${code}`));
          }
          resolve();
        });

        child.on('error', (error: Error) => {
          console.log(chalk.red(`❌ Error executing command: ${error.message}`));
          resolve();
        });
      });
    }

    console.log(chalk.green('✅ Portfolio API tests completed!'));
    console.log();
    await this.showPostCommandMenu();
  }

  private async executeLocalServices(): Promise<void> {
    console.log(chalk.blue.bold('\n🚀 Starting All Local Services\n'));

    console.log(chalk.yellow('This will start 3 services in parallel:'));
    console.log('  • CLOB Indexer (Core)');
    console.log('  • WebSocket Service');
    console.log('  • Analytics Service\n');

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Make sure infrastructure is running. Continue?',
        default: true
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Operation cancelled.\n'));
      await this.showPostCommandMenu();
      return;
    }

    console.log(chalk.green('\n✨ Starting services...\n'));
    console.log(chalk.gray('Press Ctrl+C to stop all services\n'));

    // Create child processes for each service
    const services = [
      {
        name: 'CLOB Indexer',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: '..',
        color: chalk.cyan
      },
      {
        name: 'WebSocket Service',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: '../websocket-service',
        color: chalk.green
      },
      {
        name: 'Analytics Service',
        command: 'npm',
        args: ['run', 'dev'],
        cwd: '../analytics-service',
        color: chalk.magenta
      }
    ];

    const children: any[] = [];

    // Start all services
    services.forEach(service => {
      console.log(service.color(`[${service.name}] Starting...`));

      const child: ChildProcess = spawn(service.command, service.args, {
        cwd: service.cwd,
        shell: true,
        env: { ...process.env, FORCE_COLOR: 'true' }
      });

      // Prefix output with service name
      child.stdout?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          console.log(service.color(`[${service.name}]`), line);
        });
      });

      child.stderr?.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          console.error(service.color(`[${service.name}]`), chalk.red(line));
        });
      });

      child.on('error', (error: Error) => {
        console.error(service.color(`[${service.name}]`), chalk.red(`Failed to start: ${error.message}`));
      });

      child.on('exit', (code: number | null) => {
        console.log(service.color(`[${service.name}]`), chalk.yellow(`Exited with code ${code}`));
      });

      children.push(child);
    });

    // Handle graceful shutdown
    const cleanup = () => {
      console.log(chalk.yellow('\n\nShutting down services...'));
      children.forEach(child => {
        child.kill('SIGTERM');
      });
      setTimeout(() => {
        children.forEach(child => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        });
        process.exit(0);
      }, 5000);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Wait for all services to exit
    await Promise.all(children.map(child =>
      new Promise(resolve => child.on('exit', resolve))
    ));

    console.log(chalk.yellow('\nAll services stopped.'));
    await this.showPostCommandMenu();
  }

  private async showPostCommandMenu(): Promise<void> {
    const { nextAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'nextAction',
        message: 'What would you like to do next?',
        choices: [
          { name: '🔄 Run another command from this category', value: 'category' },
          { name: '🏠 Return to main menu', value: 'main' },
          { name: '🚪 Exit', value: 'exit' }
        ]
      }
    ]);

    switch (nextAction) {
      case 'category':
        if (this.currentCategory) {
          await this.showCategoryMenu(this.currentCategory);
        } else {
          await this.showMainMenu();
        }
        break;
      case 'main':
        await this.showMainMenu();
        break;
      case 'exit':
        console.log(chalk.green('👋 Goodbye!'));
        process.exit(0);
    }
  }

  public async start(): Promise<void> {
    try {
      await this.showMainMenu();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'isTtyError' in error) {
        console.error(chalk.red('❌ This CLI requires an interactive terminal'));
      } else {
        console.error(chalk.red('❌ An unexpected error occurred:'), error);
      }
      process.exit(1);
    }
  }
}

// Start the CLI
const cli = new CLI();
cli.start().catch((error) => {
  console.error(chalk.red('❌ Failed to start CLI:'), error);
  process.exit(1);
});