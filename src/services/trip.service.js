const db = require('../database');

class TripService {
  async list(filters = {}) {
    let query = 'SELECT * FROM trips WHERE status = $1';
    const params = ['PUBLISHED'];
    
    // Simple filter logic
    if (filters.destination) {
      query += ' AND destination ILIKE $2';
      params.push(`%${filters.destination}%`);
    }
    
    const result = await db.query(query, params);
    return result.rows;
  }

  async getById(id) {
    const result = await db.query('SELECT * FROM trips WHERE id = $1', [id]);
    return result.rows[0];
  }

  async create(data) {
    const {
      title, destination, start_date, end_date, price, max_capacity,
      refundable_until_days_before = 7, cancellation_fee_percent = 10
    } = data;
    
    const query = `
      INSERT INTO trips (title, destination, start_date, end_date, price, max_capacity, available_seats, status, refundable_until_days_before, cancellation_fee_percent)
      VALUES ($1, $2, $3, $4, $5, $6, $6, 'PUBLISHED', $7, $8)
      RETURNING *
    `;
    const result = await db.query(query, [title, destination, start_date, end_date, price, max_capacity, refundable_until_days_before, cancellation_fee_percent]);
    return result.rows[0];
  }
  
  async decrementSeats(client, tripId, numSeats) {
    // CRITICAL: Row-level locking to prevent overbooking
    const lockQuery = 'SELECT available_seats FROM trips WHERE id = $1 FOR UPDATE';
    const lockRes = await client.query(lockQuery, [tripId]);
    
    if (lockRes.rows.length === 0) throw new Error('Trip not found');
    
    const currentSeats = lockRes.rows[0].available_seats;
    if (currentSeats < numSeats) {
      throw new Error('Insufficient seats available');
    }
    
    const updateQuery = 'UPDATE trips SET available_seats = available_seats - $1, updated_at = NOW() WHERE id = $2';
    await client.query(updateQuery, [numSeats, tripId]);
  }

  async incrementSeats(client, tripId, numSeats) {
    const query = 'UPDATE trips SET available_seats = available_seats + $1, updated_at = NOW() WHERE id = $2';
    await client.query(query, [numSeats, tripId]);
  }
}

module.exports = new TripService();
