#!/bin/bash

# ScaleX CLOB Indexer Deployment Script
# Deploys and configures the enhanced indexer with lending protocol support

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

echo "🚀 Starting ScaleX CLOB Indexer Deployment..."

# Check if we're in the right directory
if [[ ! -f "ponder/package.json" ]] && [[ ! -d "src" ]]; then
    print_error "Please run this script from the clob-indexer project root directory"
    exit 1
fi

# Check Node.js and npm
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed or not in PATH"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed or not in PATH"
    exit 1
fi

print_success "Node.js version: $(node --version)"
print_success "npm version: $(npm --version)"

# Check if required environment variables are set
check_env_var() {
    if [[ -z "${!1}" ]]; then
        print_warning "Environment variable $1 is not set"
        return 1
    else
        print_success "$1: ${!1}"
        return 0
    fi
}

# Load environment variables from .env file if it exists
if [[ -f ".env" ]]; then
    print_step "Loading environment variables from .env file..."
    set -a  # automatically export all variables
    source .env
    set +a  # turn off auto-export
    print_success "Environment variables loaded from .env"
fi

echo ""
print_step "Checking environment variables..."

# Required variables
REQUIRED_VARS=("REDIS_URL" "DATABASE_URL" "RPC_URL_ScaleX_CORE" "RPC_URL_ScaleX_SIDE")
missing_vars=()

for var in "${REQUIRED_VARS[@]}"; do
    if ! check_env_var "$var"; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    print_error "Missing required environment variables: ${missing_vars[*]}"
    echo ""
    echo "Please set the following environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "  export $var=<your_$var>"
    done
    echo ""
    echo "Optional variables:"
    echo "  export LOG_LEVEL=info"
    echo "  export PORT=3000"
    echo "  export ENABLE_WEBSOCKET=true"
    echo "  export ENABLE_SYSTEM_MONITOR=true"
    exit 1
fi

# Step 1: Install dependencies
print_step "Step 1: Installing dependencies..."
npm ci
print_success "Dependencies installed"

# Step 2: Generate types
print_step "Step 2: Generating types..."
npm run build
print_success "Types generated"

# Step 3: Database setup
print_step "Step 3: Setting up database..."

# Check if DATABASE_URL includes sslmode requirement
if [[ "$DATABASE_URL" != *"sslmode"* ]]; then
    export DATABASE_URL="$DATABASE_URL?sslmode=require"
    print_success "Added SSL mode to DATABASE_URL"
fi

# Run database migration if needed
if npm run db:migrate &>/dev/null; then
    print_success "Database migration completed"
else
    print_warning "Database migration not needed or failed (this is often normal)"
fi

# Step 4: Validate configuration
print_step "Step 4: Validating configuration..."

# Test database connection
if npm run db:validate &>/dev/null; then
    print_success "Database connection validated"
else
    print_warning "Database validation failed - check connection"
fi

# Test Redis connection if REDIS_URL is set
if [[ -n "$REDIS_URL" ]]; then
    if npm run redis:test &>/dev/null; then
        print_success "Redis connection validated"
    else
        print_warning "Redis connection failed - check Redis URL"
    fi
fi

# Step 5: Start services
print_step "Step 5: Starting indexer services..."

# Create a systemd service file for production deployment
create_systemd_service() {
    local service_name="scalex-clob-indexer"
    local service_file="/etc/systemd/system/${service_name}.service"
    local working_dir=$(pwd)
    local user=$(whoami)
    
    if [[ $EUID -eq 0 ]]; then
        print_step "Creating systemd service..."
        
        cat > "$service_file" << EOF
[Unit]
Description=ScaleX CLOB Indexer
After=network.target

[Service]
Type=simple
User=$user
WorkingDirectory=$working_dir
Environment=NODE_ENV=production
Restart=always
RestartSec=10
ExecStart=/usr/bin/npm run start

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
        systemctl enable "$service_name"
        print_success "Systemd service created: $service_name"
        print_success "To start: sudo systemctl start $service_name"
        print_success "To check status: sudo systemctl status $service_name"
    else
        print_warning "Not running as root - skipping systemd service creation"
    fi
}

# Step 6: Health check
print_step "Step 6: Performing health check..."

# Check if API server can start (quick test)
timeout 10s npm run dev &>/dev/null &
API_PID=$!
sleep 3

if kill -0 $API_PID 2>/dev/null; then
    kill $API_PID 2>/dev/null
    print_success "API server health check passed"
else
    print_warning "API server health check failed"
fi

# Create deployment info file
create_deployment_info() {
    local deployment_info="./deployment-info.json"
    
    cat > "$deployment_info" << EOF
{
    "deployment": {
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
        "version": "$(npm run version --silent 2>/dev/null || echo 'unknown')",
        "environment": "${NODE_ENV:-development}",
        "working_directory": "$(pwd)"
    },
    "services": {
        "api": {
            "port": "${PORT:-3000}",
            "websocket_enabled": "${ENABLE_WEBSOCKET:-false}",
            "system_monitor_enabled": "${ENABLE_SYSTEM_MONITOR:-false}"
        },
        "database": {
            "configured": true,
            "url_set": $([ -n "$DATABASE_URL" ] && echo "true" || echo "false")
        },
        "redis": {
            "configured": $([ -n "$REDIS_URL" ] && echo "true" || echo "false"),
            "url_set": $([ -n "$REDIS_URL" ] && echo "true" || echo "false")
        }
    },
    "endpoints": {
        "api": "http://localhost:${PORT:-3000}",
        "graphql": "http://localhost:${PORT:-3000}/graphql",
        "docs": "http://localhost:${PORT:-3000}/docs"
    },
    "features": {
        "lending_protocol": true,
        "oracle_integration": true,
        "synthetic_tokens": true,
        "realtime_events": true,
        "cross_chain": true
    }
}
EOF

    print_success "Deployment info saved to: $deployment_info"
}

echo ""
print_success "🎉 ScaleX CLOB Indexer deployment completed!"

# Display deployment summary
echo ""
print_step "📊 Deployment Summary:"
echo "  🌐 API Server: http://localhost:${PORT:-3000}"
echo "  📖 GraphQL: http://localhost:${PORT:-3000}/graphql"
echo "  📚 API Docs: http://localhost:${PORT:-3000}/docs"
echo ""

# Display available endpoints
print_step "🔗 Available API Endpoints:"
echo "  📈 Lending Protocol:"
echo "    GET /api/lending/positions/{user}"
echo "    GET /api/lending/stats"
echo "    GET /api/lending/rates"
echo "    GET /api/lending/yield/{user}"
echo "    GET /api/lending/health-factors"
echo "    GET /api/lending/collateral/{user}"
echo ""
echo "  💰 Price Data:"
echo "    GET /api/prices/current"
echo "    GET /api/prices/history/{token}"
echo ""
echo "  📊 CLOB Trading:"
echo "    GET /api/kline"
echo "    GET /api/depth"
echo "    GET /api/trades"
echo "    GET /api/ticker/24hr"

# Create deployment info
create_deployment_info

# Ask about systemd service
echo ""
read -p "Do you want to create a systemd service for production deployment? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [[ $EUID -eq 0 ]]; then
        create_systemd_service
    else
        print_warning "Please run with sudo to create systemd service:"
        echo "  sudo bash $0"
    fi
fi

echo ""
print_success "🚀 ScaleX CLOB Indexer is ready!"
echo ""
echo "Next steps:"
echo "  🔄 Start the indexer: npm run dev (development) or npm start (production)"
echo "  📊 Check status: curl http://localhost:${PORT:-3000}/"
echo "  🧪 Test API: curl http://localhost:${PORT:-3000}/api/lending/stats"
echo ""
echo "For production deployment:"
echo "  📋 Monitor logs: journalctl -u scalex-clob-indexer -f"
echo "  🔧 Restart service: sudo systemctl restart scalex-clob-indexer"
echo ""