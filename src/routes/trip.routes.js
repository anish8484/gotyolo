const express = require('express');
const router = express.Router();
const tripController = require('../controllers/trip.controller');

router.get('/', tripController.list);
router.get('/:id', tripController.getById);
router.post('/', tripController.create); // Admin endpoint (simplified auth)

module.exports = router;
