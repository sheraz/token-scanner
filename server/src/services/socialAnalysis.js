const dotenv = require('dotenv');
dotenv.config();

const snoowrap = require('snoowrap');

class RedditAnalyzer {
  constructor() {
    this.redditClient = new snoowrap({
      userAgent: 'YourAppName',
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      username: process.env.REDDIT_USERNAME,
      password: process.env.REDDIT_PASSWORD,
    });

    console.log('Client ID:', process.env.REDDIT_CLIENT_ID);
    console.log('Client Secret:', process.env.REDDIT_CLIENT_SECRET);
    console.log('Username:', process.env.REDDIT_USERNAME);
    console.log('Password:', process.env.REDDIT_PASSWORD);
  }

  async analyzeCommunity(symbol) {
    try {
      const searchResults = await this.redditClient.search({
        query: symbol,
        sort: 'new',
        time: 'day',
      });

      const postCount = searchResults.length;
      const uniqueUsers = new Set(searchResults.map(post => post.author.name)).size;

      return {
        postCount,
        uniqueUsers,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error(`Error fetching Reddit metrics for ${symbol}:`, error.message);
      return {
        postCount: 0,
        uniqueUsers: 0,
        timestamp: Date.now(),
      };
    }
  }
}

module.exports = RedditAnalyzer;