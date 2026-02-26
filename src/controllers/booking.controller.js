const bookingService = require('../services/booking.service');
const { v4: uuidv4 } = require('uuid');

class BookingController {
  async create(req, res) {
    try {
      const { tripId } = req.params;
      const { num_seats, user_id } = req.body; // User ID from body for testing
      
      if (!user_id) return res.status(400).json({ error: 'user_id required' });
      
      const result = await bookingService.create(tripId, user_id, num_seats);
      res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('Not enough seats')) {
        return res.status(409).json({ error: 'No seats available' });
      }
      res.status(400).json({ error: err.message });
    }
  }

  async cancel(req, res) {
    try {
      const result = await bookingService.cancel(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
  
  async getById(req, res) {
    const booking = await bookingService.getById(req.params.id);
    if(!booking) return res.status(404).json({ error: 'Not found' });
    res.json(booking);
  }
}

module.exports = new BookingController();
