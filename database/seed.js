const db = require('../src/database');
const { v4: uuidv4 } = require('uuid');

const sampleTrips = [
  {
    id: uuidv4(),
    title: 'Paris City Tour',
    destination: 'Paris, France',
    start_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
    end_date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    price: 500.00,
    max_capacity: 10,
    refundable_until_days_before: 3,
    cancellation_fee_percent: 10
  },
  {
    id: uuidv4(),
    title: 'Alpine Hiking',
    destination: 'Swiss Alps',
    start_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days (At risk)
    end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    price: 800.00,
    max_capacity: 20,
    refundable_until_days_before: 7,
    cancellation_fee_percent: 20
  },
  {
    id: uuidv4(),
    title: 'Tokyo Lights',
    destination: 'Tokyo, Japan',
    start_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    end_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
    price: 1200.00,
    max_capacity: 5,
    refundable_until_days_before: 14,
    cancellation_fee_percent: 5
  }
];

module.exports = async function seed() {
  try {
    // Check if seeded
    const res = await db.query('SELECT count(*) FROM trips');
    if (parseInt(res.rows[0].count) > 0) return;

    console.log('Seeding database...');
    
    for (const trip of sampleTrips) {
      await db.query(`
        INSERT INTO trips (id, title, destination, start_date, end_date, price, max_capacity, available_seats, status, refundable_until_days_before, cancellation_fee_percent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'PUBLISHED', $8, $9)
      `, [trip.id, trip.title, trip.destination, trip.start_date, trip.end_date, trip.price, trip.max_capacity, trip.refundable_until_days_before, trip.cancellation_fee_percent]);
    }
    
    console.log('Database seeded successfully.');
  } catch (err) {
    console.error('Seeding error:', err);
  }
};
