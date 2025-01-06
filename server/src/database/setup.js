const Database = require('better-sqlite3');
require('dotenv').config();

function setupDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const DATABASE_PATH = process.env.DATABASE_PATH || './tokens.db';
      const db = new Database(DATABASE_PATH, { 
        verbose: console.log 
      });
      
      console.log('Connected to SQLite database');

      // Create tokens table with all necessary fields
      db.exec(`
        CREATE TABLE IF NOT EXISTS tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          address TEXT NOT NULL UNIQUE,
          name TEXT,
          symbol TEXT,
          marketCap REAL,
          holders INTEGER,
          liquidity REAL,
          launchDate TEXT,
          lastUpdated TEXT,
          socialMetrics TEXT,
          engagementScore REAL,
          tweetCount INTEGER,
          uniqueUsers INTEGER,
          totalLikes INTEGER,
          totalRetweets INTEGER,
          totalReplies INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('Database setup completed');
      resolve(db);
    } catch (error) {
      console.error('Database setup error:', error.message);
      reject(error);
    }
  });
}

module.exports = setupDatabase;