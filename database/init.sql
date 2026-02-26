CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trips Table
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    max_capacity INTEGER NOT NULL,
    available_seats INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT',
    refundable_until_days_before INTEGER DEFAULT 7,
    cancellation_fee_percent INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookings Table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trip_id UUID REFERENCES trips(id),
    user_id UUID NOT NULL,
    num_seats INTEGER NOT NULL,
    state VARCHAR(50) DEFAULT 'PENDING_PAYMENT',
    price_at_booking DECIMAL(10, 2) NOT NULL,
    payment_reference VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    refund_amount DECIMAL(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for concurrency checks
CREATE INDEX idx_trips_available_seats ON trips(id, available_seats);
CREATE INDEX idx_bookings_state ON bookings(state);
CREATE INDEX idx_bookings_expires_at ON bookings(expires_at);
