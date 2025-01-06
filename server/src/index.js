const express = require('express');
const cors = require('cors');
const tokensRouter = require('./routes/tokens');
const setupDatabase = require('./database/setup');
const TokenScanner = require('./services/scanner');  // Add this
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/tokens', tokensRouter);

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Initialize database, scanner, and start server
setupDatabase()
  .then(() => {
    // Initialize and start token scanner
    const tokenScanner = new TokenScanner();
    tokenScanner.scanNewTokens();  // Initial scan
    
    // Schedule recurring scans
    setInterval(async () => {
      await tokenScanner.scanNewTokens();
    }, 1000 * 60 * 15);  // Every 15 minutes

    // Start server
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  })
  .catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });