const db = require('../database');
const { v4: uuidv4 } = require('uuid');
const tripService = require('./trip.service');

class BookingService {
  async create(tripId, userId, numSeats) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // 1. Lock trip and check availability
      const tripQ = await client.query('SELECT * FROM trips WHERE id = $1 FOR UPDATE', [tripId]);
      const trip = tripQ.rows[0];
      
      if (!trip) throw new Error('Trip not found');
      if (trip.status !== 'PUBLISHED') throw new Error('Trip not available');
      if (trip.available_seats < numSeats) throw new Error('Not enough seats available');
      
      // 2. Create booking
      const totalPrice = trip.price * numSeats;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      
      const insertQ = `
        INSERT INTO bookings (trip_id, user_id, num_seats, price_at_booking, state, expires_at)
        VALUES ($1, $2, $3, $4, 'PENDING_PAYMENT', $5)
        RETURNING *
      `;
      const bookingRes = await client.query(insertQ, [tripId, userId, numSeats, totalPrice, expiresAt]);
      const booking = bookingRes.rows[0];
      
      // 3. Decrement seats
      await client.query('UPDATE trips SET available_seats = available_seats - $1 WHERE id = $2', [numSeats, tripId]);
      
      await client.query('COMMIT');
      
      return {
        ...booking,
        payment_url: `https://mock-payment.com/pay/${booking.id}` // Mocked
      };
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async processWebhook(bookingId, status, idempotencyKey) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      // Idempotency Check
      const idemCheck = await client.query('SELECT id FROM bookings WHERE idempotency_key = $1', [idempotencyKey]);
      if (idemCheck.rows.length > 0) {
        console.log(`Duplicate webhook received: ${idempotencyKey}`);
        await client.query('COMMIT'); // Safe to acknowledge
        return { status: 'duplicate' };
      }
      
      // Lock Booking
      const bookingQ = await client.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [bookingId]);
      const booking = bookingQ.rows[0];
      
      if (!booking) {
        console.log(`Webhook for non-existent booking: ${bookingId}`);
        await client.query('COMMIT');
        return { status: 'ignored' };
      }
      
      if (booking.state !== 'PENDING_PAYMENT') {
        console.log(`Booking ${bookingId} already processed.`);
        await client.query('COMMIT');
        return { status: 'ignored' };
      }
      
      // Update State
      let newState = status === 'success' ? 'CONFIRMED' : 'EXPIRED';
      
      const updateQ = `
        UPDATE bookings 
        SET state = $1, idempotency_key = $2, updated_at = NOW()
        WHERE id = $3
      `;
      await client.query(updateQ, [newState, idempotencyKey, bookingId]);
      
      // If payment failed, release seats
      if (newState === 'EXPIRED') {
        await tripService.incrementSeats(client, booking.trip_id, booking.num_seats);
      }
      
      await client.query('COMMIT');
      return { status: 'processed', newState };
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancel(bookingId) {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');
      
      const bookingQ = await client.query('SELECT b.*, t.start_date, t.refundable_until_days_before, t.cancellation_fee_percent FROM bookings b JOIN trips t ON b.trip_id = t.id WHERE b.id = $1 FOR UPDATE', [bookingId]);
      const booking = bookingQ.rows[0];
      
      if (!booking) throw new Error('Booking not found');
      if (booking.state !== 'CONFIRMED') throw new Error('Only confirmed bookings can be cancelled via user endpoint');
      
      // Calculate Refund
      const now = new Date();
      const tripStart = new Date(booking.start_date);
      const diffDays = (tripStart - now) / (1000 * 60 * 60 * 24);
      
      let refundAmount = 0;
      let releaseSeats = false;
      
      if (diffDays > booking.refundable_until_days_before) {
        // Refundable
        const fee = booking.price_at_booking * (booking.cancellation_fee_percent / 100);
        refundAmount = booking.price_at_booking - fee;
        releaseSeats = true;
      } else {
        // Non-refundable (Per requirements: don't release seats? 
        // Wait, logic check: "Release seats back to availability when cancelled" is a general rule, 
        // but specific rule for After Cutoff says "Don’t release seats".
        // We will follow the specific rule.)
        releaseSeats = false; 
      }
      
      const updateQ = `
        UPDATE bookings 
        SET state = 'CANCELLED', cancelled_at = NOW(), refund_amount = $1, updated_at = NOW()
        WHERE id = $2
      `;
      await client.query(updateQ, [refundAmount, bookingId]);
      
      if (releaseSeats) {
        await tripService.incrementSeats(client, booking.trip_id, booking.num_seats);
      }
      
      await client.query('COMMIT');
      return { refundAmount, status: 'CANCELLED' };
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(id) {
    const result = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
    return result.rows[0];
  }
  
  async expireBookings() {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      // Find expired pending bookings
      const res = await client.query(`
        UPDATE bookings
        SET state = 'EXPIRED', updated_at = NOW()
        WHERE state = 'PENDING_PAYMENT' AND expires_at < NOW()
        RETURNING id, trip_id, num_seats
      `);
      
      const expiredBookings = res.rows;
      
      // Release seats
      for (const b of expiredBookings) {
        await tripService.incrementSeats(client, b.trip_id, b.num_seats);
        console.log(`Expired booking ${b.id}, released ${b.num_seats} seats for trip ${b.trip_id}`);
      }
      
      await client.query('COMMIT');
      return expiredBookings.length;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = new BookingService();
