#!/bin/bash

# ScaleX CLOB System Test Script
# Tests all microservices to ensure they're working correctly

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    log_info "Testing: $test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        log_success "$test_name"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        log_error "$test_name"
        return 1
    fi
}

echo "🧪 ScaleX CLOB System Tests"
echo "========================"

# Test 1: Check if infrastructure is running
run_test "PostgreSQL connection" "docker-compose -f docker-compose.yml exec -T postgres pg_isready"
run_test "Redis connection" "docker-compose -f docker-compose.yml exec -T redis redis-cli ping"

# Test 2: Check if services are responding
run_test "WebSocket service health" "curl -f http://localhost:8080/health"
run_test "Analytics service health" "curl -f http://localhost:3001/health"

# Test 3: Check API endpoints
run_test "Analytics market overview API" "curl -f http://localhost:3001/api/market/overview"
run_test "Analytics health endpoint" "curl -f http://localhost:3001/health"

# Test 4: Check WebSocket connection
run_test "WebSocket connection test" "timeout 5 bash -c '</dev/tcp/localhost/42080'"

# Test 5: Check Redis streams
if docker-compose -f docker-compose.yml exec -T redis redis-cli EXISTS trades > /dev/null 2>&1; then
    run_test "Redis streams exist" "docker-compose -f docker-compose.yml exec -T redis redis-cli EXISTS trades"
else
    log_warning "Redis streams not found (normal if no events have been processed yet)"
fi

# Test 6: Check database tables
run_test "Database tables exist" "docker-compose -f docker-compose.yml exec -T postgres psql -U postgres -d ponder -c '\dt' | grep -q orders"

echo
echo "📊 Test Results"
echo "==============="
echo "Passed: $PASSED_TESTS/$TOTAL_TESTS tests"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}✅ All tests passed! System is working correctly.${NC}"
    echo
    echo "🚀 Ready for development!"
    echo
    echo "Try these commands:"
    echo "  • Test WebSocket: npm run ws-client"
    echo "  • View logs: ./scripts/microservices.sh logs"
    echo "  • Monitor Redis: open http://localhost:8081"
    echo "  • View metrics: open http://localhost:3000"
    exit 0
else
    echo -e "${RED}❌ Some tests failed. Check the output above.${NC}"
    echo
    echo "Common issues:"
    echo "  • Services might still be starting up (wait 30 seconds)"
    echo "  • Check if all services are running: ./scripts/microservices.sh status"
    echo "  • View service logs: ./scripts/microservices.sh logs"
    exit 1
fi