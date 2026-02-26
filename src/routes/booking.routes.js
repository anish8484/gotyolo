const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');

router.post('/:tripId/book', bookingController.create);
router.get('/:id', bookingController.getById);
router.post('/:id/cancel', bookingController.cancel);

module.exports = router;
