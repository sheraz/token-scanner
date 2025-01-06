const axios = require('axios');

class SocialAnalyzer {
  constructor(twitterBearerToken) {
    this.twitterClient = axios.create({
      baseURL: 'https://api.twitter.com/2',
      headers: {
        'Authorization': `Bearer ${twitterBearerToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'v2RecentSearchJS'
      }
    });
    
    // Add cache for API responses
    this.cache = new Map();
    this.lastRequestTime = 0;
    this.requestDelay = 3000; // 3 seconds between requests
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async rateLimitedRequest(endpoint, params) {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.requestDelay) {
      await this.sleep(this.requestDelay - timeSinceLastRequest);
    }

    this.lastRequestTime = Date.now();
    return this.twitterClient.get(endpoint, { params });
  }

  async analyzeCommunity(tokenSymbol) {
    // Check cache first
    const cacheKey = `${tokenSymbol}-${Math.floor(Date.now() / (1000 * 60 * 15))}`; // 15-minute cache
    if (this.cache.has(cacheKey)) {
      console.log(`Using cached data for ${tokenSymbol}`);
      return this.cache.get(cacheKey);
    }

    try {
      const tweetsResponse = await this.rateLimitedRequest('/tweets/search/recent', {
        query: `${tokenSymbol} crypto -is:retweet`,
        max_results: 100,
        'tweet.fields': 'public_metrics,created_at,author_id'
      });

      const tweets = tweetsResponse.data.data || [];
      
      const metrics = {
        tweetCount: tweets.length,
        totalLikes: 0,
        totalRetweets: 0,
        totalReplies: 0,
        uniqueUsers: new Set(),
        hourlyDistribution: new Array(24).fill(0)
      };

      tweets.forEach(tweet => {
        metrics.totalLikes += tweet.public_metrics.like_count;
        metrics.totalRetweets += tweet.public_metrics.retweet_count;
        metrics.totalReplies += tweet.public_metrics.reply_count;
        metrics.uniqueUsers.add(tweet.author_id);
        
        const hour = new Date(tweet.created_at).getHours();
        metrics.hourlyDistribution[hour]++;
      });

      const engagementScore = this.calculateEngagementScore(metrics);
      
      const result = {
        ...metrics,
        uniqueUsers: metrics.uniqueUsers.size,
        engagementScore
      };

      // Cache the result
      this.cache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      if (error.response?.status === 429) {
        console.log(`Rate limit hit for ${tokenSymbol}, using fallback metrics`);
        return {
          tweetCount: 0,
          totalLikes: 0,
          totalRetweets: 0,
          totalReplies: 0,
          uniqueUsers: 0,
          engagementScore: 0,
          hourlyDistribution: new Array(24).fill(0)
        };
      }
      console.error('Twitter API error:', error.response?.data || error.message);
      return null;
    }
  }

  calculateEngagementScore(metrics) {
    const tweetsWeight = 0.3;
    const engagementWeight = 0.4;
    const uniqueUsersWeight = 0.3;

    const tweetScore = Math.min(metrics.tweetCount / 100, 1) * 100;
    const engagementScore = Math.min(
      (metrics.totalLikes + metrics.totalRetweets * 2 + metrics.totalReplies * 3) / 1000, 
      1
    ) * 100;
    const uniqueUsersScore = Math.min(metrics.uniqueUsers.size / 50, 1) * 100;

    return Math.round(
      tweetScore * tweetsWeight +
      engagementScore * engagementWeight +
      uniqueUsersScore * uniqueUsersWeight
    );
  }
}

module.exports = SocialAnalyzer;