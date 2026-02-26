## Engineering Proposal
### Booking Lifecycle & State Transitions
The booking lifecycle follows a strict state machine to ensure data integrity and clear business logic.

### State Diagram:

[ Start ]
    |
    v
PENDING_PAYMENT  ----(15 min timeout)----> EXPIRED
    |                                        ^
    |                                        |
    |----(Webhook: Failed)-------------------|
    |
    |----(Webhook: Success)----> CONFIRMED
                                     |
                                     |----(User Cancel: Before Cutoff)---> CANCELLED (Refund Issued)
                                     |
                                     |----(User Cancel: After Cutoff)----> CANCELLED (No Refund)

### State Definitions:

PENDING_PAYMENT: Initial state. Seats are reserved (deducted from available_seats). If stuck here > 15 mins, auto-expire.
CONFIRMED: Payment successful. Seats are definitively sold.
EXPIRED: Payment failed or timed out. Seats are released back to available_seats.
CANCELLED: User terminated the booking. Depending on policy, seats may or may not be released.
2. Overbooking Prevention Strategy
Strategy: Pessimistic Locking via Database Row-Level Locks.

### Implementation:
In PostgreSQL, we use SELECT ... FOR UPDATE within a transaction.

Start Transaction.
SELECT available_seats FROM trips WHERE id = $1 FOR UPDATE; (This locks the row).
Check capacity.
If available: UPDATE trips SET available_seats = ... and INSERT booking.
Commit Transaction (releases lock).
Why:
This creates a "critical section." If two users try to book the last seat simultaneously, the second user's request will wait at step 2 until the first user commits. Upon waiting, the second user sees the updated (decremented) count and receives a "No seats" error, guaranteeing zero overbooking.

#### Database Transaction Usage
Transactions are used to maintain the invariant: The sum of available_seats + booked_seats must always equal max_capacity (ignoring expired/cancelled).

Booking Creation:
Atomically checks availability, creates the booking record, and decrements the trip's available_seats.
Rollback: If any step fails (e.g., DB error), the seat reservation is voided.
Webhook Processing:
Atomically updates booking state and (if failed) increments available_seats.
Prevents race conditions where a webhook and an expiry job might try to modify the same booking simultaneously.
Cancellation:
Atomically updates booking state to CANCELLED and increments available_seats (if policy permits).
#### Booking Auto-Expiry Implementation
Strategy: Polling Background Job (Node.js setInterval).

#### Implementation:
A lightweight worker runs every 60 seconds:

Query bookings where state = 'PENDING_PAYMENT' AND expires_at < NOW().
Update state to EXPIRED.
Release seats back to the trip.
Alternative Considered: Database Cron jobs or Redis delayed queues.
Why Polling: For the required scale, a simple polling worker is sufficiently reliable and easier to deploy (no external infrastructure dependencies like Redis queues). The 15-minute window makes a 60-second polling delay negligible.

#### Trade-offs
Pessimistic Locking vs. Optimistic Locking:
Chosen: Pessimistic (FOR UPDATE).
Trade-off: Lower throughput for high-contention items (popular trips) because requests queue up. However, it provides stronger guarantees than Optimistic Locking (version checking) which requires retry logic and can frustrate users during "flash sales."
Polling vs. Schedulers:
Chosen: Polling.
Trade-off: Not real-time (up to 60s delay). Real-time schedulers (e.g., RabbitMQ DLX) are more complex to manage for a simple startup MVP.
#### High Traffic Scenario Analysis
Scenario: 500 booking requests arrive simultaneously for a single popular trip.

What could fail?
Database Connection Exhaustion: The Node.js app has a connection pool limit (e.g., 10 connections). If 500 requests come in, 490 will wait or timeout immediately if not queued properly.
Lock Contention (Serialization): Since we use SELECT FOR UPDATE, the database processes these bookings serially (one by one). The 500th request will wait for 499 transactions to finish. If a transaction takes 50ms, the 500th request waits 25 seconds, likely hitting HTTP timeouts.
API Latency: Users perceive the app as "frozen" due to the queueing.
Protection Strategies
Rate Limiting (Application Level):
Implement rate limiting (e.g., 10 requests per second per IP or per trip) using middleware like express-rate-limit. This immediately rejects excess traffic with 429 Too Many Requests before hitting the database.
Optimistic Locking Fallback:
Switch from FOR UPDATE to Optimistic Locking (adding a version column).
Process: Read seat count -> Attempt Update WHERE id=? AND available_seats >= ? AND version=?.
Benefit: No locking queue. Requests fail fast.
Cost: Higher failure rate for the user (requires frontend retry logic).
Queueing System (Architecture Level):
Place booking requests into a message queue (RabbitMQ/Kafka).
A separate "Booking Worker" processes them sequentially at a sustainable rate.
The API responds immediately with 202 Accepted ("We are processing your request"), and the frontend polls for status updates.
Recommended Safeguards
For this case study, the current implementation is safe but would suffer latency. To improve it:

Shorter Transaction Time: Ensure the code inside the transaction block is minimal (no external API calls inside the transaction).
Connection Pool Sizing: Ensure the PG pool size is tuned to the database instance capacity.
#### Design Justification: Denormalized Seats
Why Denormalization?
The available_seats field is stored on the Trip model rather than calculating it dynamically via max_capacity - COUNT(bookings).

#### Reasons:

Performance: Checking availability is the most read-heavy operation. Running COUNT() on a large bookings table (potentially millions of rows) for every page view is expensive (O(N) scan). Storing available_seats makes the read operation O(1) (constant time).
Filtering: It allows efficient database queries like SELECT * FROM trips WHERE available_seats > 0, enabling users to find open trips without complex subqueries.
Risks & Consistency
Risk: Data inconsistency. If a booking is created but the available_seats is not decremented (due to a code bug or partial failure), the system will oversell.

#### How we ensure Consistency:

ACID Transactions: We never modify available_seats outside a transaction. The database guarantees that both the INSERT INTO bookings and UPDATE trips happen atomically, or neither happens.
Source of Truth: The available_seats field is the "cache" of the truth. We never allow manual updates to it; it is only modified via domain logic (book/cancel).
Auditing (Optional): In production, a periodic "reconciler" job could run to calculate max_capacity - SUM(active_bookings) and compare it to available_seats, alerting if a mismatch is detected.


                                     
