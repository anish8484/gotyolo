const bookingService = require('../services/booking.service');

class WebhookController {
  async handlePaymentWebhook(req, res) {
    const { booking_id, status, idempotency_key } = req.body;
    
    try {
      await bookingService.processWebhook(booking_id, status, idempotency_key);
      // ALWAYS return 200 OK to webhook provider
      res.status(200).send('OK');
    } catch (err) {
      console.error('Webhook processing error:', err);
      res.status(200).send('OK (logged error)'); // Still 200
    }
  }
}

module.exports = new WebhookController();
