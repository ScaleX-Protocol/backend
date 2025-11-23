#!/bin/bash

# Multi-Chain Configuration Launcher
# Supports separated core-chain and side-chain configurations
# Usage: ./start-chains.sh [MODE] [OPTIONS]

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/logs"

# Create necessary directories
mkdir -p "$PID_DIR" "$LOG_DIR"

# Configuration
CORE_PORT=42070
SIDE_PORT=42071
CORE_DB="ponder_core"
SIDE_DB="ponder_side"

# Function to display help
show_help() {
    echo -e "${BLUE}🔗 Multi-Chain Configuration Launcher${NC}"
    echo ""
    echo -e "${YELLOW}USAGE:${NC}"
    echo "  ./start-chains.sh [MODE] [OPTIONS]"
    echo ""
    echo -e "${YELLOW}MODES:${NC}"
    echo -e "  ${GREEN}core${NC}         Start core-chain configuration only (OrderBook, PoolManager)"
    echo -e "  ${GREEN}side${NC}         Start side-chain configuration only (ChainBalanceManager)"
    echo -e "  ${GREEN}both${NC}         Start both configurations concurrently"
    echo -e "  ${GREEN}status${NC}       Show status of running processes"
    echo -e "  ${GREEN}stop${NC}        Stop all running processes"
    echo -e "  ${GREEN}logs${NC}        Show logs from running processes"
    echo -e "  ${GREEN}help${NC}        Show this help message"
    echo ""
    echo -e "${YELLOW}OPTIONS:${NC}"
    echo -e "  ${GREEN}--pm2${NC}        Use PM2 process manager (background)"
    echo -e "  ${GREEN}--dev${NC}        Use development mode (default)"
    echo -e "  ${GREEN}--prod${NC}       Use production mode"
    echo -e "  ${GREEN}--follow${NC}     Follow logs in real-time (with logs command)"
    echo ""
    echo -e "${YELLOW}EXAMPLES:${NC}"
    echo "  ./start-chains.sh core              # Start core in foreground"
    echo "  ./start-chains.sh both --pm2        # Start both with PM2"
    echo "  ./start-chains.sh side --dev        # Start side in dev mode"
    echo "  ./start-chains.sh logs --follow     # Follow logs in real-time"
    echo "  ./start-chains.sh stop              # Stop all processes"
    echo ""
    echo -e "${YELLOW}CONFIGURATIONS:${NC}"
    echo -e "  ${CYAN}Core Chain:${NC}  Chain 31337, Port $CORE_PORT, DB: $CORE_DB"
    echo -e "  ${CYAN}              ${NC}  URL: http://localhost:$CORE_PORT"
    echo -e "  ${CYAN}Side Chain:${NC}  Chain 31337, Port $SIDE_PORT, DB: $SIDE_DB"
    echo -e "  ${CYAN}              ${NC}  URL: http://localhost:$SIDE_PORT"
    echo ""
    echo -e "${YELLOW}REDIS:${NC}"
    echo -e "  ${CYAN}Shared Redis:${NC} localhost:6379 with chain-specific keys"
    echo -e "  ${CYAN}Core Keys:${NC}    chain:31337:*"
    echo -e "  ${CYAN}Side Keys:${NC}    chain:31337:*"
}

# Function to check if process is running
is_process_running() {
    local pid_file="$1"
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Function to check PM2 process
is_pm2_running() {
    local process_name="$1"
    if command -v pm2 &> /dev/null; then
        pm2 list | grep -q "$process_name.*online" 2>/dev/null
        return $?
    fi
    return 1
}

# Function to start core configuration
start_core() {
    local use_pm2="$1"
    local mode="$2"
    
    echo -e "${BLUE}🚀 Starting Core Chain Configuration...${NC}"
    echo -e "${CYAN}  Chain ID: 31337, Port: $CORE_PORT, DB: $CORE_DB${NC}"
    echo -e "${CYAN}  Redis Keys: chain:31337:*${NC}"
    echo -e "${CYAN}  URL: http://localhost:$CORE_PORT${NC}"
    
    if [[ "$use_pm2" == "true" ]]; then
        if ! command -v pm2 &> /dev/null; then
            echo -e "${RED}❌ PM2 not found. Install with: npm install -g pm2${NC}"
            return 1
        fi
        
        local pm2_name="chain-core"
        
        # Stop existing process
        pm2 delete "$pm2_name" 2>/dev/null || true
        
        # Start with PM2
        cd "$SCRIPT_DIR"
        if [[ "$mode" == "prod" ]]; then
            pm2 start pnpm --name "$pm2_name" -- run "start:core-chain"
        else
            pm2 start pnpm --name "$pm2_name" -- run "dev:core-chain"
        fi
        
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}✅ Core chain configuration started with PM2${NC}"
            echo -e "${YELLOW}💡 View logs: pm2 logs $pm2_name${NC}"
        else
            echo -e "${RED}❌ Failed to start core chain configuration with PM2${NC}"
            return 1
        fi
    else
        # Start in foreground
        echo -e "${YELLOW}🔄 Starting core chain configuration in foreground...${NC}"
        cd "$SCRIPT_DIR"
        
        # Use environment copying to ensure config separation
        if [[ "$mode" == "prod" ]]; then
            pnpm run start:core-chain > "$LOG_DIR/core-chain.log" 2>&1 &
        else
            pnpm run dev:core-chain > "$LOG_DIR/core-chain.log" 2>&1 &
        fi
        
        local pid=$!
        echo "$pid" > "$PID_DIR/core-chain.pid"
        echo -e "${GREEN}✅ Core chain configuration started (PID: $pid)${NC}"
        echo -e "${YELLOW}💡 Log file: $LOG_DIR/core-chain.log${NC}"
        
        # Show initial logs
        sleep 2
        echo -e "${CYAN}📋 Initial logs:${NC}"
        tail -10 "$LOG_DIR/core-chain.log"
    fi
}

# Function to start side configuration
start_side() {
    local use_pm2="$1"
    local mode="$2"
    
    echo -e "${BLUE}🚀 Starting Side Chain Configuration...${NC}"
    echo -e "${CYAN}  Chain ID: 31337, Port: $SIDE_PORT, DB: $SIDE_DB${NC}"
    echo -e "${CYAN}  Redis Keys: chain:31337:*${NC}"
    echo -e "${CYAN}  URL: http://localhost:$SIDE_PORT${NC}"
    
    if [[ "$use_pm2" == "true" ]]; then
        if ! command -v pm2 &> /dev/null; then
            echo -e "${RED}❌ PM2 not found. Install with: npm install -g pm2${NC}"
            return 1
        fi
        
        local pm2_name="chain-side"
        
        # Stop existing process
        pm2 delete "$pm2_name" 2>/dev/null || true
        
        # Start with PM2
        cd "$SCRIPT_DIR"
        if [[ "$mode" == "prod" ]]; then
            pm2 start pnpm --name "$pm2_name" -- run "start:side-chain"
        else
            pm2 start pnpm --name "$pm2_name" -- run "dev:side-chain"
        fi
        
        if [[ $? -eq 0 ]]; then
            echo -e "${GREEN}✅ Side chain configuration started with PM2${NC}"
            echo -e "${YELLOW}💡 View logs: pm2 logs $pm2_name${NC}"
        else
            echo -e "${RED}❌ Failed to start side chain configuration with PM2${NC}"
            return 1
        fi
    else
        # Start in foreground
        echo -e "${YELLOW}🔄 Starting side chain configuration in foreground...${NC}"
        cd "$SCRIPT_DIR"
        
        # Use environment copying to ensure config separation
        if [[ "$mode" == "prod" ]]; then
            pnpm run start:side-chain > "$LOG_DIR/side-chain.log" 2>&1 &
        else
            pnpm run dev:side-chain > "$LOG_DIR/side-chain.log" 2>&1 &
        fi
        
        local pid=$!
        echo "$pid" > "$PID_DIR/side-chain.pid"
        echo -e "${GREEN}✅ Side chain configuration started (PID: $pid)${NC}"
        echo -e "${YELLOW}💡 Log file: $LOG_DIR/side-chain.log${NC}"
        
        # Show initial logs
        sleep 2
        echo -e "${CYAN}📋 Initial logs:${NC}"
        tail -10 "$LOG_DIR/side-chain.log"
    fi
}

# Function to start both configurations
start_both() {
    local use_pm2="$1"
    local mode="$2"
    
    echo -e "${PURPLE}🚀 Starting Both Chain Configurations...${NC}"
    
    if [[ "$use_pm2" == "true" ]]; then
        start_core "$use_pm2" "$mode"
        echo ""
        sleep 3
        start_side "$use_pm2" "$mode"
        
        echo ""
        echo -e "${GREEN}✅ Both chain configurations started with PM2${NC}"
        echo -e "${YELLOW}💡 View all: pm2 status${NC}"
        echo -e "${YELLOW}💡 View logs: pm2 logs chain-core chain-side${NC}"
    else
        # Use concurrently for foreground mode
        if ! command -v npx &> /dev/null; then
            echo -e "${RED}❌ npx not found. Please install Node.js${NC}"
            return 1
        fi
        
        echo -e "${YELLOW}🔄 Starting both configurations with concurrently...${NC}"
        cd "$SCRIPT_DIR"
        
        # Use the existing pnpm script that uses concurrently
        if [[ "$mode" == "prod" ]]; then
            pnpm run start:both-chains
        else
            pnpm run dev:both-chains
        fi
    fi
}

# Function to show process status
show_status() {
    echo -e "${BLUE}📊 Chain Process Status${NC}"
    echo ""
    
    # Check PM2 processes
    if command -v pm2 &> /dev/null; then
        echo -e "${YELLOW}PM2 Processes:${NC}"
        if pm2 list | grep -q "chain-.*online"; then
            pm2 list | grep "chain-"
        else
            echo "  No chain PM2 processes running"
        fi
        echo ""
    fi
    
    # Check PID-based processes
    echo -e "${YELLOW}Direct Processes:${NC}"
    
    # Core process
    if is_process_running "$PID_DIR/core-chain.pid"; then
        local pid=$(cat "$PID_DIR/core-chain.pid")
        echo -e "  ${GREEN}✅ Core Chain:${NC} Running (PID: $pid, Port: $CORE_PORT)"
    else
        echo -e "  ${RED}❌ Core Chain:${NC} Not running"
    fi
    
    # Side process
    if is_process_running "$PID_DIR/side-chain.pid"; then
        local pid=$(cat "$PID_DIR/side-chain.pid")
        echo -e "  ${GREEN}✅ Side Chain:${NC} Running (PID: $pid, Port: $SIDE_PORT)"
    else
        echo -e "  ${RED}❌ Side Chain:${NC} Not running"
    fi
    
    echo ""
    echo -e "${CYAN}Configuration Information:${NC}"
    echo -e "  Core DB: $CORE_DB (Port: $CORE_PORT)"
    echo -e "  Side DB: $SIDE_DB (Port: $SIDE_PORT)"
    echo -e "  Redis: localhost:6379 (shared with chain-specific keys)"
    echo -e "  Core Keys: chain:31337:*"
    echo -e "  Side Keys: chain:31337:*"
}

# Function to stop all processes
stop_all() {
    echo -e "${YELLOW}🛑 Stopping All Chain Processes...${NC}"
    
    # Stop PM2 processes
    if command -v pm2 &> /dev/null; then
        pm2 delete chain-core 2>/dev/null || true
        pm2 delete chain-side 2>/dev/null || true
        echo -e "${GREEN}✅ PM2 chain processes stopped${NC}"
    fi
    
    # Stop PID-based processes
    for config in core-chain side-chain; do
        local pid_file="$PID_DIR/${config}.pid"
        if is_process_running "$pid_file"; then
            local pid=$(cat "$pid_file")
            echo -e "${YELLOW}🛑 Stopping $config process (PID: $pid)...${NC}"
            kill "$pid" 2>/dev/null || true
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}⚠️  Force killing $config process...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$pid_file"
        fi
    done
    
    echo -e "${GREEN}✅ All chain processes stopped${NC}"
}

# Function to show logs
show_logs() {
    local follow="$1"
    
    echo -e "${BLUE}📋 Chain Process Logs${NC}"
    echo ""
    
    # PM2 logs
    if command -v pm2 &> /dev/null; then
        if pm2 list | grep -q "chain-.*online"; then
            echo -e "${YELLOW}PM2 Logs:${NC}"
            if [[ "$follow" == "true" ]]; then
                pm2 logs chain-core chain-side --lines 50
            else
                pm2 logs chain-core chain-side --lines 20 --nostream
            fi
            return
        fi
    fi
    
    # Direct process logs
    echo -e "${YELLOW}Log Files:${NC}"
    for config in core-chain side-chain; do
        local log_file="$LOG_DIR/${config}.log"
        if [[ -f "$log_file" ]]; then
            echo -e "${CYAN}--- $config Configuration ---${NC}"
            if [[ "$follow" == "true" ]]; then
                tail -f "$log_file" &
            else
                tail -20 "$log_file"
            fi
            echo ""
        else
            echo -e "${RED}❌ No log file found for $config${NC}"
        fi
    done
    
    if [[ "$follow" == "true" ]]; then
        echo -e "${YELLOW}💡 Press Ctrl+C to stop following logs${NC}"
        wait
    fi
}

# Main function
main() {
    local mode=""
    local use_pm2="false"
    local run_mode="dev"
    local follow_logs="false"
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            core|side|both|status|stop|logs|help)
                mode="$1"
                shift
                ;;
            --pm2)
                use_pm2="true"
                shift
                ;;
            --dev)
                run_mode="dev"
                shift
                ;;
            --prod)
                run_mode="prod"
                shift
                ;;
            --follow)
                follow_logs="true"
                shift
                ;;
            *)
                echo -e "${RED}❌ Unknown option: $1${NC}"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Default to help if no mode specified
    if [[ -z "$mode" ]]; then
        show_help
        exit 0
    fi
    
    # Handle modes
    case "$mode" in
        core)
            start_core "$use_pm2" "$run_mode"
            ;;
        side)
            start_side "$use_pm2" "$run_mode"
            ;;
        both)
            start_both "$use_pm2" "$run_mode"
            ;;
        status)
            show_status
            ;;
        stop)
            stop_all
            ;;
        logs)
            show_logs "$follow_logs"
            ;;
        help)
            show_help
            ;;
        *)
            echo -e "${RED}❌ Unknown mode: $mode${NC}"
            show_help
            exit 1
            ;;
    esac
}

# Handle script interruption
trap 'echo -e "\n${YELLOW}⚠️  Script interrupted${NC}"; exit 130' INT

# Run main function
main "$@"