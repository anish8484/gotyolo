const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');

router.get('/trips/:tripId/metrics', adminController.getTripMetrics);
router.get('/trips/at-risk', adminController.getAtRiskTrips);

module.exports = router;
