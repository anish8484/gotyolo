const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// Payment Provider Webhook
router.post('/webhook', webhookController.handlePaymentWebhook);

module.exports = router;
