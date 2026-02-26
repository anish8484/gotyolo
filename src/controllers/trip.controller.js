const tripService = require('../services/trip.service');

class TripController {
  async list(req, res) {
    try {
      const trips = await tripService.list(req.query);
      res.json(trips);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getById(req, res) {
    try {
      const trip = await tripService.getById(req.params.id);
      if (!trip) return res.status(404).json({ error: 'Trip not found' });
      res.json(trip);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async create(req, res) {
    try {
      const trip = await tripService.create(req.body);
      res.status(201).json(trip);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

module.exports = new TripController();
