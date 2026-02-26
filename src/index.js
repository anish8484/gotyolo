const express = require('express');
const cors = require('cors');
const config = require('./config');
const db = require('./database');

// Routes
const tripRoutes = require('./routes/trip.routes');
const bookingRoutes = require('./routes/booking.routes');
const webhookRoutes = require('./routes/webhook.routes');
const adminRoutes = require('./routes/admin.routes');

// Jobs
const startExpiryJob = require('./jobs/expiry.job');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/trips', tripRoutes);
app.use('/bookings', bookingRoutes);
app.use('/payments', webhookRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const server = app.listen(config.port, () => {
  console.log(`GoTyolo API running on port ${config.port}`);
  
  // Start background job for auto-expiry
  startExpiryJob();
  
  // Run seeding on startup for demo purposes
  require('../database/seed.js')(); 
});

module.exports = { app, server, db };
