const axios = require('axios');

class SocialAnalyzer {
  constructor(bearerToken) {
    this.bearerToken = bearerToken;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
  }

  async analyzeCommunity(symbol, cacheKey) {
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log(`Using cached metrics for ${symbol}`);
      return cached.data;
    }

    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    try {
      // Default metrics if rate limited
      const metrics = {
        tweetCount: 0,
        uniqueUsers: 0,
        engagementScore: 0,
        hourlyDistribution: new Array(24).fill(0),
        timestamp: Date.now()
      };

      // Cache even if we're using default metrics
      this.cache.set(cacheKey, {
        data: metrics,
        timestamp: Date.now()
      });

      return metrics;
    } catch (error) {
      console.error(`Error analyzing ${symbol}:`, error.message);
      throw error;
    }
  }
}

module.exports = SocialAnalyzer;