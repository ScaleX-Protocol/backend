#!/bin/bash

# ScaleX CLOB Development Setup Script
# This script sets up the entire development environment step by step

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "websocket-service" ] || [ ! -d "analytics-service" ]; then
    log_error "Please run this script from the clob-indexer root directory"
    exit 1
fi

log_info "Starting ScaleX CLOB Development Environment Setup..."

# Step 1: Check prerequisites
log_info "Step 1: Checking prerequisites..."

if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

log_success "Prerequisites check passed"

# Step 2: Install dependencies
log_info "Step 2: Installing dependencies for all services..."

log_info "Installing main indexer dependencies..."
npm install

log_info "Installing WebSocket service dependencies..."
cd websocket-service
npm install
cd ..

log_info "Installing Analytics service dependencies..."
cd analytics-service
npm install
cd ..

log_success "All dependencies installed"

# Step 3: Setup environment files
log_info "Step 3: Setting up environment files..."

# Main indexer .env
if [ ! -f ".env" ]; then
    cat > .env << EOF
# ScaleX CLOB Indexer Configuration
PONDER_DATABASE_URL=postgresql://postgres:password@localhost:5433/ponder
REDIS_URL=redis://localhost:6380
ENABLE_EVENT_PUBLISHING=true
ENABLE_WEBSOCKET=false
ENABLE_SYSTEM_MONITOR=true
SYSTEM_MONITOR_INTERVAL=60
EOF
    log_info "Created main .env file"
fi

# WebSocket service .env
if [ ! -f "websocket-service/.env" ]; then
    cat > websocket-service/.env << EOF
# WebSocket Service Configuration
PORT=42080
HOST=localhost
HEALTH_PORT=8080

# Redis Configuration
REDIS_URL=redis://localhost:6380

# Database Configuration (Read-only access)
DATABASE_URL=postgresql://postgres:password@localhost:5433/ponder

# Service Configuration
SERVICE_NAME=websocket-service
LOG_LEVEL=info

# Consumer Group Configuration
CONSUMER_GROUP=websocket-consumers
CONSUMER_ID=ws-consumer-dev-1

# Batch Processing
BATCH_SIZE=10
POLL_INTERVAL=1000

# WebSocket Configuration
WS_PING_INTERVAL=30000
WS_PONG_TIMEOUT=5000
MAX_CONNECTIONS=1000
EOF
    log_info "Created websocket-service/.env file"
fi

# Analytics service .env
if [ ! -f "analytics-service/.env" ]; then
    cat > analytics-service/.env << EOF
# Analytics Service Configuration
PORT=3001
HOST=localhost

# Redis Configuration
REDIS_URL=redis://localhost:6380

# Database Configuration (Read-only access)
DATABASE_URL=postgresql://postgres:password@localhost:5433/ponder

# Service Configuration
SERVICE_NAME=analytics-service
LOG_LEVEL=info

# Consumer Group Configuration
CONSUMER_GROUP=analytics-consumers
CONSUMER_ID=analytics-consumer-dev-1

# Batch Processing
ANALYTICS_BATCH_SIZE=5
ANALYTICS_POLL_INTERVAL=5000

# Cache Configuration
CACHE_TTL=300
REFRESH_INTERVAL=60

# Periodic Tasks
ENABLE_DAILY_SNAPSHOTS=true
ENABLE_HOURLY_AGGREGATION=true
ENABLE_CACHE_REFRESH=true
EOF
    log_info "Created analytics-service/.env file"
fi

log_success "Environment files created"

# Step 4: Make scripts executable
log_info "Step 4: Making scripts executable..."
chmod +x scripts/microservices.sh
log_success "Scripts are now executable"

# Step 5: Start infrastructure services
log_info "Step 5: Starting infrastructure services (PostgreSQL, Redis)..."
docker-compose -f docker-compose.yml up -d postgres redis

# Wait for services to be ready
log_info "Waiting for databases to be ready..."
sleep 10

# Check if PostgreSQL is ready
log_info "Checking PostgreSQL..."
until docker-compose -f docker-compose.yml exec -T postgres pg_isready > /dev/null 2>&1; do
    log_info "Waiting for PostgreSQL..."
    sleep 2
done
log_success "PostgreSQL is ready"

# Check if Redis is ready
log_info "Checking Redis..."
until docker-compose -f docker-compose.yml exec -T redis redis-cli ping > /dev/null 2>&1; do
    log_info "Waiting for Redis..."
    sleep 2
done
log_success "Redis is ready"

# Step 6: Show next steps
echo
log_success "🎉 Development environment setup complete!"
echo
echo "Next steps:"
echo
echo "1. Start the development environment:"
echo "   ${GREEN}./scripts/microservices.sh dev${NC}"
echo
echo "2. Or start services individually:"
echo "   ${YELLOW}# Terminal 1 - Start indexer${NC}"
echo "   npm run dev"
echo
echo "   ${YELLOW}# Terminal 2 - Start WebSocket service${NC}"
echo "   cd websocket-service && npm run dev"
echo
echo "   ${YELLOW}# Terminal 3 - Start Analytics service${NC}"
echo "   cd analytics-service && npm run dev"
echo
echo "3. Check service status:"
echo "   ${GREEN}./scripts/microservices.sh status${NC}"
echo
echo "4. View logs:"
echo "   ${GREEN}./scripts/microservices.sh logs${NC}"
echo
echo "Available URLs (after starting services):"
echo "  • WebSocket: wss://core-devnet.scalex.money/ws"
echo "  • Analytics API: http://localhost:3001/api"
echo "  • WebSocket Health: http://localhost:8080/health"
echo "  • Analytics Health: http://localhost:3001/health"
echo "  • Grafana: http://localhost:3000 (admin/admin)"
echo "  • Prometheus: http://localhost:9090"
echo "  • Redis Commander: http://localhost:8081"
echo
echo "For more details, see DEVELOPMENT.md"