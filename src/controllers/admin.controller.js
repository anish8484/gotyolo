const db = require('../database');

class AdminController {
  async getTripMetrics(req, res) {
    const { tripId } = req.params;
    
    const tripQ = await db.query('SELECT * FROM trips WHERE id = $1', [tripId]);
    if (tripQ.rows.length === 0) return res.status(404).json({ error: 'Trip not found' });
    const trip = tripQ.rows[0];
    
    // Aggregation
    const statsQ = await db.query(`
      SELECT 
        COUNT(CASE WHEN state = 'CONFIRMED' THEN 1 END) as confirmed,
        COUNT(CASE WHEN state = 'PENDING_PAYMENT' THEN 1 END) as pending_payment,
        COUNT(CASE WHEN state = 'CANCELLED' THEN 1 END) as cancelled,
        COUNT(CASE WHEN state = 'EXPIRED' THEN 1 END) as expired,
        COALESCE(SUM(CASE WHEN state = 'CONFIRMED' THEN price_at_booking END), 0) as gross_revenue,
        COALESCE(SUM(refund_amount), 0) as refunds_issued
      FROM bookings
      WHERE trip_id = $1
    `, [tripId]);
    
    const stats = statsQ.rows[0];
    
    res.json({
      trip_id: trip.id,
      title: trip.title,
      occupancy_percent: ((trip.max_capacity - trip.available_seats) / trip.max_capacity * 100).toFixed(2),
      total_seats: trip.max_capacity,
      booked_seats: trip.max_capacity - trip.available_seats,
      available_seats: trip.available_seats,
      booking_summary: {
        confirmed: parseInt(stats.confirmed) || 0,
        pending_payment: parseInt(stats.pending_payment) || 0,
        cancelled: parseInt(stats.cancelled) || 0,
        expired: parseInt(stats.expired) || 0,
      },
      financial: {
        gross_revenue: parseFloat(stats.gross_revenue) || 0,
        refunds_issued: parseFloat(stats.refunds_issued) || 0,
        net_revenue: (parseFloat(stats.gross_revenue) || 0) - (parseFloat(stats.refunds_issued) || 0)
      }
    });
  }

  async getAtRiskTrips(req, res) {
    // Trips departing within 7 days with < 50% occupancy
    const query = `
      SELECT 
        id, title, start_date, 
        (max_capacity - available_seats) as booked_seats,
        max_capacity
      FROM trips
      WHERE status = 'PUBLISHED'
      AND start_date > NOW()
      AND start_date < NOW() + INTERVAL '7 days'
      AND (max_capacity - available_seats) < (max_capacity * 0.5)
    `;
    
    const result = await db.query(query);
    
    const trips = result.rows.map(t => ({
      trip_id: t.id,
      title: t.title,
      departure_date: t.start_date,
      occupancy_percent: ((t.booked_seats / t.max_capacity) * 100).toFixed(2),
      reason: "Low occupancy with imminent departure"
    }));
    
    res.json({ at_risk_trips: trips });
  }
}

module.exports = new AdminController();
