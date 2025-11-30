#!/bin/bash

# ScaleX CLOB Microservices Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
# Detect if running from scripts directory or project root
if [ -f "docker-compose.yml" ]; then
    # Running from project root
    COMPOSE_FILE="docker-compose.yml"
    WEBSOCKET_SERVICE_DIR="websocket-service"
    ANALYTICS_SERVICE_DIR="analytics-service"
elif [ -f "../docker-compose.yml" ]; then
    # Running from scripts directory
    COMPOSE_FILE="../docker-compose.yml"
    WEBSOCKET_SERVICE_DIR="../websocket-service"
    ANALYTICS_SERVICE_DIR="../analytics-service"
else
    log_error "Could not find docker-compose.yml. Run from project root or scripts directory."
    exit 1
fi

PROJECT_NAME="scalex-clob"

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

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    log_success "Dependencies check passed"
}

# Build services
build_services() {
    log_info "Building microservices..."
    
    # Store current directory to return to it later
    ORIGINAL_DIR=$(pwd)
    
    # Build WebSocket service
    log_info "Building WebSocket service..."
    cd "$WEBSOCKET_SERVICE_DIR"
    npm install
    npm run build
    cd "$ORIGINAL_DIR"
    
    # Build Analytics service
    log_info "Building Analytics service..."
    cd "$ANALYTICS_SERVICE_DIR"
    npm install
    npm run build
    cd "$ORIGINAL_DIR"
    
    log_success "Services built successfully"
}

# Setup environment files
setup_env() {
    log_info "Setting up environment files..."
    
    # Copy example env files if they don't exist
    if [ ! -f "$WEBSOCKET_SERVICE_DIR/.env" ]; then
        cp "$WEBSOCKET_SERVICE_DIR/.env.example" "$WEBSOCKET_SERVICE_DIR/.env"
        log_info "Created websocket-service/.env from example"
    fi
    
    if [ ! -f "$ANALYTICS_SERVICE_DIR/.env" ]; then
        cp "$ANALYTICS_SERVICE_DIR/.env.example" "$ANALYTICS_SERVICE_DIR/.env"
        log_info "Created analytics-service/.env from example"
    fi
    
    log_success "Environment files ready"
}

# Start services
start_services() {
    log_info "Starting microservices..."
    
    # Start core services first
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d postgres timescaledb redis
    
    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    sleep 15
    
    # Start application services
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d clob-indexer websocket-service analytics-service
    
    # Start infrastructure services
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME up -d nginx prometheus grafana
    
    log_success "All services started"
}

# Stop services
stop_services() {
    log_info "Stopping microservices..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down
    log_success "All services stopped"
}

# Restart services
restart_services() {
    log_info "Restarting microservices..."
    stop_services
    start_services
}

# Show logs
show_logs() {
    local service=$1
    if [ -z "$service" ]; then
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f
    else
        docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME logs -f "$service"
    fi
}

# Show status
show_status() {
    log_info "Service status:"
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME ps
    
    echo
    log_info "Health checks:"
    
    # Check WebSocket service
    if curl -s http://localhost:8080/health > /dev/null; then
        log_success "WebSocket service: healthy"
    else
        log_error "WebSocket service: unhealthy"
    fi
    
    # Check Analytics service
    if curl -s http://localhost:42090/health > /dev/null; then
        log_success "Analytics service: healthy"
    else
        log_error "Analytics service: unhealthy"
    fi
    
    # Check Redis
    if docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis: healthy"
    else
        log_error "Redis: unhealthy"
    fi
    
    # Check PostgreSQL
    if docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME exec -T postgres pg_isready > /dev/null 2>&1; then
        log_success "PostgreSQL: healthy"
    else
        log_error "PostgreSQL: unhealthy"
    fi
    
    # Check TimescaleDB
    if docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME exec -T timescaledb pg_isready > /dev/null 2>&1; then
        log_success "TimescaleDB: healthy"
    else
        log_error "TimescaleDB: unhealthy"
    fi
}

# Development mode (with dev profile)
dev_mode() {
    log_info "Starting development environment..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME --profile dev up -d
    log_success "Development environment started with Redis Commander"
}

# Clean up
cleanup() {
    log_info "Cleaning up..."
    docker-compose -f $COMPOSE_FILE -p $PROJECT_NAME down -v --remove-orphans
    docker system prune -f
    log_success "Cleanup completed"
}

# Main script
case "$1" in
    "build")
        check_dependencies
        build_services
        ;;
    "setup")
        check_dependencies
        setup_env
        ;;
    "start")
        check_dependencies
        setup_env
        start_services
        show_status
        echo
        log_info "Services available at:"
        echo "  • WebSocket: wss://core-devnet.scalex.money/ws"
        echo "  • Analytics API: http://localhost:42090/api"
        echo "  • PostgreSQL: localhost:5433 (indexer data)"
        echo "  • TimescaleDB: localhost:5434 (analytics data)"
        echo "  • Nginx Proxy: http://localhost:80"
        echo "  • Grafana: http://localhost:3000 (admin/admin)"
        echo "  • Prometheus: http://localhost:9090"
        ;;
    "stop")
        stop_services
        ;;
    "restart")
        restart_services
        ;;
    "logs")
        show_logs "$2"
        ;;
    "status")
        show_status
        ;;
    "dev")
        check_dependencies
        setup_env
        dev_mode
        ;;
    "clean")
        cleanup
        ;;
    *)
        echo "ScaleX CLOB Microservices Management"
        echo ""
        echo "Usage: $0 {build|setup|start|stop|restart|logs|status|dev|clean}"
        echo ""
        echo "Commands:"
        echo "  build    - Build all services"
        echo "  setup    - Setup environment files"
        echo "  start    - Start all services"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - Show logs (optionally for specific service)"
        echo "  status   - Show service status and health"
        echo "  dev      - Start with development tools"
        echo "  clean    - Clean up containers and volumes"
        echo ""
        echo "Examples:"
        echo "  $0 start                 # Start all services"
        echo "  $0 logs websocket-service # Show logs for WebSocket service"
        echo "  $0 dev                   # Start with Redis Commander"
        exit 1
        ;;
esac