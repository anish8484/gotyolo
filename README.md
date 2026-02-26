## GoTyolo Backend
A backend API for a travel booking platform handling trip discovery, booking state machines, concurrent reservations, and refund policies.

## Tech Stack
Node.js & Express: Lightweight, efficient for I/O heavy APIs.
PostgreSQL: Chosen for robust transaction support and row-level locking essential for preventing overbooking.
Docker: For consistent environment setup.
Setup Instructions
Prerequisites: Install Docker and Docker Compose.
Run Application:
docker-compose up --build
The API will be available at http://localhost:3000. The database will be seeded automatically with sample trips.

## Project Structure

gotyolo/
├── Dockerfile              # Container definition for the Node.js app
├── docker-compose.yml      # Orchestrates App and PostgreSQL services
├── package.json            # Project dependencies and scripts
├── src/
│   ├── config.js           # Environment variables and configuration
│   ├── database.js         # PostgreSQL connection pool setup
│   ├── index.js            # Application entry point (Express setup)
│   ├── routes/             # Defines API endpoints and maps to controllers
│   │   ├── admin.routes.js
│   │   ├── booking.routes.js
│   │   ├── trip.routes.js
│   │   └── webhook.routes.js
│   ├── controllers/        # Handles HTTP request parsing and response formatting
│   │   ├── admin.controller.js
│   │   ├── booking.controller.js
│   │   ├── trip.controller.js
│   │   └── webhook.controller.js
│   ├── services/           # Core business logic (Transactions, State Machines)
│   │   ├── booking.service.js
│   │   └── trip.service.js
│   └── jobs/               # Background tasks (Auto-expiry worker)
│       └── expiry.job.js
└── database/               # Database schema and initialization
    ├── init.sql            # Table definitions and indexes
    └── seed.js             # Mock data generation script

## Folder Responsibilities
#### src/routes/: Defines the API contract (URL paths and HTTP methods). It validates basic input parameters and delegates work to controllers.
#### src/controllers/: Orchestrates the request flow. It extracts parameters from the request, calls the appropriate service functions, and formats the HTTP response (JSON status codes).
#### src/services/: Contains the critical business logic. This layer handles database transactions, concurrency locking (SELECT FOR UPDATE), and state machine transitions. It is kept independent of the HTTP layer to allow for easier testing.
#### src/jobs/: Houses scheduled tasks, specifically the worker that finds and expires stale PENDING_PAYMENT bookings.
#### database/: Manages the persistence layer. init.sql runs automatically on container startup to ensure the schema is ready.    

## API Documentation
Trips
GET /trips: List all published trips.
GET /trips/:id: Get trip details.
POST /trips: Create a trip (Admin).
Body: { "title": "...", "destination": "...", "start_date": "...", "end_date": "...", "price": 100, "max_capacity": 10 }
Bookings
POST /trips/:tripId/book: Create a booking.
Body: { "user_id": "uuid", "num_seats": 2 }
Returns booking with payment_url.
GET /bookings/:id: Check booking status.
POST /bookings/:id/cancel: Cancel a confirmed booking.
Payments (Webhooks)
POST /payments/webhook: Endpoint for payment provider.
Body: { "booking_id": "uuid", "status": "success", "idempotency_key": "unique_key" }
Admin
GET /admin/trips/:tripId/metrics: Financial and occupancy stats.
GET /admin/trips/at-risk: Trips departing soon with low occupancy.
Architecture & Design Decisions
1. Concurrency & Overbooking Prevention
To prevent two users booking the last seat simultaneously, the system uses PostgreSQL Row-Level Locking (SELECT ... FOR UPDATE).

When a booking request starts, the transaction locks the specific Trip row.
Other requests for the same trip wait for the lock to release.
Once the first transaction commits (decreasing seats), the next transaction proceeds, sees insufficient seats, and fails safely.
2. Idempotency
Webhooks can arrive multiple times. The bookings table has a unique idempotency_key column.

If a webhook arrives, we check if that key exists.
If yes, we return 200 OK immediately without reprocessing state changes or refund logic.
3. State Machine
Bookings follow a strict lifecycle:

PENDING_PAYMENT (Initial) -> CONFIRMED (Webhook Success) or EXPIRED (Webhook Fail/Timeout).
CONFIRMED -> CANCELLED (User action).
A background job runs every minute to expire bookings stuck in PENDING_PAYMENT past the 15-minute window, releasing seats back to the pool.
Debugging Real-World Issues
In analyzing the requirements and potential failure modes, the following issues were identified and addressed in the implementation:

Bug 1: Race Condition (Overbooking)
Issue: A naive implementation checks available_seats > 0 and then updates. If two requests read available_seats = 1 simultaneously, both proceed, resulting in -1 seats.
Fix: Implemented SELECT ... FOR UPDATE inside a database transaction (booking.service.js). This serializes access to the trip row during the booking creation.

Bug 2: Incorrect Refund Calculation
Issue: Logic could incorrectly apply refunds after the cutoff date, or fail to calculate the fee percentage correctly.
Fix: Implemented strict date arithmetic in booking.service.js:
const diffDays = (tripStart - now) / (1000 * 60 * 60 * 24);
if (diffDays > refundable_until_days_before) {
   // Apply refund logic
} else {
   // No refund
}

We also ensure the cancellation_fee_percent is applied to the price_at_booking, not the current trip price.

Bug 3: Seat Release Logic on Cancellation
Issue: The prompt specifies a complex rule: "After cutoff... Don't release seats".
Fix: The code explicitly checks the cutoff date. If the cancellation is non-refundable (after cutoff), the code sets releaseSeats = false, ensuring available_seats is NOT incremented. This ensures the business doesn't resell seats for a trip departing immediately, maintaining logistics planning.


## Postman Collection (Usage Examples)

1. List Trips
```bash
curl --location 'localhost:3000/trips'

2. Create Booking
curl --location 'localhost:3000/trips/<TRIP_ID>/book' \
--header 'Content-Type: application/json' \
--data '{
    "user_id": "user-123",
    "num_seats": 1
}'

3. Simulate Payment Success
curl --location 'localhost:3000/payments/webhook' \
--header 'Content-Type: application/json' \
--data '{
    "booking_id": "<BOOKING_ID>",
    "status": "success",
    "idempotency_key": "unique-key-123"
}'

4. Check Admin Metrics

curl --location 'localhost:3000/admin/trips/<TRIP_ID>/metrics'
