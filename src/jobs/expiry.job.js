const bookingService = require('../services/booking.service');

function startExpiryJob() {
  // Run every minute
  setInterval(async () => {
    try {
      const count = await bookingService.expireBookings();
      if (count > 0) console.log(`Cleaned up ${count} expired bookings.`);
    } catch (err) {
      console.error('Expiry job failed:', err);
    }
  }, 60 * 1000);
}

module.exports = startExpiryJob;
