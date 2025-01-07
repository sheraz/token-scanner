const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
const SocialAnalyzer = require('../services/socialAnalysis');
const socialAnalyzer = new SocialAnalyzer(process.env.TWITTER_BEARER_TOKEN);

// Add rate limiting and retry logic
const CALLS_PER_SECOND = 4;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
let lastCallTime = Date.now();

async function rateLimitedRequest(url, params) {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < (1000 / CALLS_PER_SECOND)) {
    await new Promise(resolve => setTimeout(resolve, (1000 / CALLS_PER_SECOND) - timeSinceLastCall));
  }
  lastCallTime = Date.now();
  return axios.get(url, { params });
}

async function fetchWithRetry(url, config, retries = MAX_RETRIES) {
  try {
    return await axios.get(url, config);
  } catch (error) {
    if (retries > 0 && error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, config, retries - 1);
    }
    throw error;
  }
}

async function getHolderCount(tokenAddress) {
  try {
    // Use the basic token transactions endpoint
    const response = await rateLimitedRequest(`https://api.etherscan.io/api`, {
      module: 'account',
      action: 'tokentx',
      contractaddress: tokenAddress,
      page: 1,
      offset: 100, // Get last 100 transactions
      sort: 'desc',
      apikey: process.env.ETHERSCAN_API_KEY
    });

    if (response.data.status === '1' && response.data.result) {
      // Count unique addresses involved in transactions
      const uniqueAddresses = new Set();
      response.data.result.forEach(tx => {
        uniqueAddresses.add(tx.from.toLowerCase());
        uniqueAddresses.add(tx.to.toLowerCase());
      });
      return uniqueAddresses.size;
    }
    return 0;
  } catch (error) {
    console.warn(`Failed to get data for ${tokenAddress}:`, error.message);
    return 0;
  }
}

const formatTokenData = async (dexData) => {
  try {
    if (!dexData.baseToken?.address) {
      return null;
    }

    const holders = await getHolderCount(dexData.baseToken.address);
    const socialMetrics = await socialAnalyzer.analyzeCommunity(dexData.baseToken.symbol);

    return {
      name: dexData.baseToken?.name || 'Unknown',
      symbol: dexData.baseToken?.symbol || 'Unknown',
      address: dexData.baseToken?.address,
      marketCap: parseFloat(dexData.fdv || 0),
      liquidity: parseFloat(dexData.liquidity?.usd || 0),
      holders,
      priceUsd: parseFloat(dexData.priceUsd || 0),
      volume24h: parseFloat(dexData.volume?.h24 || 0),
      created: dexData.pairCreatedAt || new Date().toISOString(),
      socialMetrics: socialMetrics || {
        engagementScore: 0,
        tweetCount: 0,
        uniqueUsers: 0
      }
    };
  } catch (error) {
    console.error('Error formatting token data:', error);
    return null;
  }
};

router.get('/', async (req, res) => {
  try {
    const { minHolders = 0, minLiquidity = 0, sort } = req.query;
    
    console.log('Received request with params:', { minHolders, minLiquidity, sort });

    const endpoints = [
      'https://api.dexscreener.com/latest/dex/tokens/trending',
      'https://api.dexscreener.com/latest/dex/tokens/ethereum',
      'https://api.dexscreener.com/latest/dex/search?q=meme'
    ];

    let allPairs = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithRetry(endpoint, {
          timeout: 10000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        });

        if (response.data && response.data.pairs && Array.isArray(response.data.pairs)) {
          console.log(`Found ${response.data.pairs.length} pairs from ${endpoint}`);
          const validPairs = response.data.pairs.filter(pair => 
            pair.liquidity?.usd >= minLiquidity &&
            pair.baseToken?.address
          );
          allPairs = [...allPairs, ...validPairs];
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${endpoint}:`, error.message);
        continue;
      }
    }

    console.log(`Total pairs found: ${allPairs.length}`);

    if (allPairs.length === 0) {
      console.warn('No pairs found from any endpoint');
      return res.json([]);
    }

    // Deduplicate pairs by contract address
    allPairs = Array.from(new Map(allPairs.map(pair => 
      [pair.baseToken?.address, pair]
    )).values());

    // Format tokens and get holder information
    const tokens = [];
    for (const pair of allPairs.slice(0, 20)) { // Limit to top 20 for processing
      try {
        const formattedToken = await formatTokenData(pair);
        if (formattedToken) {
          tokens.push(formattedToken);
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`Failed to format token ${pair.baseToken?.symbol}:`, error.message);
        continue;
      }
    }

    const filteredTokens = tokens.filter(token => {
      if (!token) return false;
      const meetsLiquidity = token.liquidity >= parseFloat(minLiquidity || 0);
      const meetsHolders = token.holders >= parseFloat(minHolders || 0);
      console.log(`Token ${token.symbol}: liquidity=${token.liquidity}, holders=${token.holders}`);
      return meetsLiquidity && meetsHolders;
    });

    if (sort) {
      const sortOptions = sort.split(',');
      filteredTokens.sort((a, b) => {
        for (const option of sortOptions) {
          switch (option) {
            case 'trending':
              return (b.volume24h || 0) - (a.volume24h || 0);
            case 'holders':
              return (b.holders || 0) - (a.holders || 0);
            case 'liquidity':
              return (b.liquidity || 0) - (a.liquidity || 0);
            case 'newest':
              return new Date(b.created || 0) - new Date(a.created || 0);
            default:
              return 0;
          }
        }
        return 0;
      });
    }

    console.log(`Returning ${filteredTokens.length} tokens after filtering`);
    res.json(filteredTokens);
  } catch (error) {
    console.error('Server error processing request:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;