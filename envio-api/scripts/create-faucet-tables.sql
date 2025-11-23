-- Create faucet requests table
CREATE TABLE IF NOT EXISTS faucet_requests (
    id SERIAL PRIMARY KEY,
    chain_id INTEGER NOT NULL,
    requester_address VARCHAR(42) NOT NULL,
    receiver_address VARCHAR(42) NOT NULL,
    token_address VARCHAR(42) NOT NULL,
    token_symbol VARCHAR(20) NOT NULL,
    token_decimals INTEGER NOT NULL,
    amount BIGINT NOT NULL,
    amount_formatted VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL, -- pending, completed, failed
    transaction_hash VARCHAR(66),
    gas_used BIGINT,
    gas_price BIGINT,
    error_message TEXT,
    request_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_timestamp TIMESTAMP WITH TIME ZONE,
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT
);

-- Create faucet rate limits table
CREATE TABLE IF NOT EXISTS faucet_rate_limits (
    id SERIAL PRIMARY KEY,
    identifier VARCHAR(100) NOT NULL, -- address or IP
    identifier_type VARCHAR(10) NOT NULL, -- 'address' or 'ip'
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    last_request_time TIMESTAMP WITH TIME ZONE NOT NULL,
    cooldown_until TIMESTAMP WITH TIME ZONE
);

-- Create unique index for rate limiting
CREATE UNIQUE INDEX IF NOT EXISTS faucet_rate_limits_identifier_type_idx 
ON faucet_rate_limits(identifier, identifier_type);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS faucet_requests_requester_address_idx ON faucet_requests(requester_address);
CREATE INDEX IF NOT EXISTS faucet_requests_chain_id_idx ON faucet_requests(chain_id);
CREATE INDEX IF NOT EXISTS faucet_requests_status_idx ON faucet_requests(status);
CREATE INDEX IF NOT EXISTS faucet_requests_request_timestamp_idx ON faucet_requests(request_timestamp);

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON faucet_requests TO postgres;
-- GRANT ALL PRIVILEGES ON faucet_rate_limits TO postgres;