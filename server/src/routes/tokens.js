const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
const SocialAnalyzer = require('../services/socialAnalysis');
const socialAnalyzer = new SocialAnalyzer(process.env.TWITTER_BEARER_TOKEN);
const WhaleAnalyzer = require('../services/whaleAnalysis');

// Create a single instance to be used throughout the app
const whaleAnalyzer = new WhaleAnalyzer();

router.get('/test', async (req, res) => {
  try {
    res.json({
      status: 'success',
      message: 'Test route is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({ error: 'Test route error' });
  }
});

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
    const response = await axios.get(url, {
      ...config,
      timeout: 20000  // Increase timeout to 20 seconds
    });
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying ${url}, ${retries} attempts remaining`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return fetchWithRetry(url, config, retries - 1);
    }
    throw error;
  }
}

async function getHolderCount(tokenAddress) {
  try {
    if (tokenAddress.startsWith('0x')) {
      console.log(`Fetching Ethereum holders for: ${tokenAddress}`);
      try {
        const response = await axios.get(`https://api.etherscan.io/api`, {
          params: {
            module: 'stats',
            action: 'tokensupply',
            contractaddress: tokenAddress,
            apikey: process.env.ETHERSCAN_API_KEY
          }
        });

        console.log('Etherscan response:', JSON.stringify(response.data, null, 2));

        if (response.data.status === '1') {
          const supply = BigInt(response.data.result);
          return supply > BigInt(0) ? 1 : 0;  // Using BigInt for large numbers
        }
      } catch (error) {
        console.error('Etherscan error:', error.message);
      }
      return 0;
    } else if (tokenAddress.length === 44 || tokenAddress.length === 43) {
      try {
        console.log(`Fetching Solana token data for: ${tokenAddress}`);
        const response = await axios.post('https://api.mainnet-beta.solana.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenSupply',  // Back to using getTokenSupply
          params: [tokenAddress]
        }, {
          timeout: 20000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.data?.result?.value) {
          const supply = response.data.result.value;
          console.log(`Got supply for ${tokenAddress}:`, supply);
          return supply.uiAmount > 0 ? 1 : 0;
        }
      } catch (error) {
        console.error('Solana error:', error.message);
      }
    }
    return 0;
  } catch (error) {
    console.warn(`Failed to get holder count for ${tokenAddress}:`, error.message);
    return 0;
  }
}

const formatTokenData = async (dexData) => {
  try {
    if (!dexData.baseToken?.address) {
      return null;
    }

    const holders = await getHolderCount(dexData.baseToken.address);
    
    // Calculate age in days
    const createdDate = new Date(dexData.pairCreatedAt || new Date());
    const ageInDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Cache social metrics
    let socialMetrics;
    try {
      const cacheKey = `social_${dexData.baseToken.symbol}`;
      socialMetrics = await socialAnalyzer.analyzeCommunity(dexData.baseToken.symbol, cacheKey);
    } catch (error) {
      console.log(`Social metrics error for ${dexData.baseToken.symbol}:`, error.message);
      socialMetrics = {
        tweetCount: 0,
        uniqueUsers: 0,
        engagementScore: 0,
        hourlyDistribution: new Array(24).fill(0)
      };
    }

    // Add debug logging for whale concentration
    const whaleData = await whaleAnalyzer.getTopHolders(dexData.baseToken.address, dexData.baseToken.symbol);
    const whaleConcentration = whaleData.whaleConcentration;
    console.log(`Whale concentration for ${dexData.baseToken.symbol}:`, whaleConcentration);

    // Enhanced token data structure
    const tokenData = {
      name: dexData.baseToken?.name || 'Unknown',
      symbol: dexData.baseToken?.symbol || 'Unknown',
      address: dexData.baseToken?.address,
      
      age: {
        days: ageInDays,
        created: createdDate,
        isNew: ageInDays < 7 // Consider tokens under 7 days as new
      },
      
      metrics: {
        fdv: parseFloat(dexData.fdv || 0),
        marketCap: parseFloat(dexData.fdv || 0), // Will update with circulating supply later
        liquidity: parseFloat(dexData.liquidity?.usd || 0),
        priceUsd: parseFloat(dexData.priceUsd || 0),
        volume24h: parseFloat(dexData.volume?.h24 || 0),
        
        holders: {
          count: holders,
          whaleConcentration: whaleConcentration,
          diamondHands: 0
        }
      },
      
      socialMetrics,
      
      links: {
        website: null,
        twitter: null,
        telegram: null,
        discord: null,
        reddit: null
      },
      
      analysis: {
        uniqueFeatures: [],
        riskFactors: [],
        communityStrength: 0 // 0-100 score
      }
    };

    // Log the token data for debugging
    console.log(`Formatted token data for ${tokenData.symbol}:`, {
      liquidity: tokenData.metrics.liquidity,
      holders: tokenData.metrics.holders.count
    });

    return tokenData;
  } catch (error) {
    console.error('Error formatting token data:', error);
    return null;
  }
};



router.get('/', async (req, res) => {
  try {
    const { minHolders = 0, minLiquidity = 0, sort } = req.query;
    
    console.log('\n🔎 Starting token search...');
    console.log(`Parameters: minLiquidity=$${minLiquidity}, minHolders=${minHolders}\n`);

    const endpoints = [
      'https://api.dexscreener.com/latest/dex/tokens/trending',
      'https://api.dexscreener.com/latest/dex/tokens/ethereum',
      'https://api.dexscreener.com/latest/dex/search?q=meme',
      'https://api.dexscreener.com/latest/dex/search?q=memecoin'
    ];

    let allPairs = [];
    for (const endpoint of endpoints) {
      try {
        const response = await fetchWithRetry(endpoint, {
          timeout: 20000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          }
        });

        if (response.data && response.data.pairs && Array.isArray(response.data.pairs)) {
          console.log(`Found ${response.data.pairs.length} pairs from ${endpoint}`);
          // Only filter for valid addresses, not liquidity yet
          const validPairs = response.data.pairs.filter(pair => pair.baseToken?.address);
          allPairs = [...allPairs, ...validPairs];
        }
      } catch (error) {
        console.warn(`Failed to fetch from ${endpoint}:`, error.message);
        continue;
      }
    }

    // Deduplicate pairs by contract address before filtering
    allPairs = Array.from(new Map(allPairs.map(pair => 
      [pair.baseToken?.address, pair]
    )).values());

    console.log(`Total unique pairs found: ${allPairs.length}`);
    console.log('Liquidity range:', {
      min: Math.min(...allPairs.map(p => p.liquidity?.usd || 0)),
      max: Math.max(...allPairs.map(p => p.liquidity?.usd || 0))
    });

    // Now apply liquidity filter
    allPairs = allPairs.filter(pair => pair.liquidity?.usd >= minLiquidity);
    console.log(`Pairs after liquidity filter (>= ${minLiquidity}): ${allPairs.length}`);

    // Format token data with enhanced information
    const tokenPromises = allPairs.map(formatTokenData);
    const tokens = (await Promise.all(tokenPromises)).filter(Boolean);

    // Filter by minimum holders and liquidity
    const filteredTokens = tokens.filter(token => {
      const meetsLiquidity = token.metrics.liquidity >= parseFloat(minLiquidity || 0);
      const meetsHolders = token.metrics.holders.count >= parseFloat(minHolders || 0);
      return meetsLiquidity && meetsHolders;
    });

    console.log('\n📊 Filtering Summary:');
    console.log(`Total tokens: ${tokens.length}`);
    console.log(`Passed filters: ${filteredTokens.length}`);
    console.log(`Min liquidity: $${minLiquidity}`);
    console.log(`Min holders: ${minHolders}\n`);

    // Sort tokens if specified
    if (sort) {
      const sortOptions = sort.split(',');
      filteredTokens.sort((a, b) => {
        for (const option of sortOptions) {
          switch (option) {
            case 'liquidity':
              return b.metrics.liquidity - a.metrics.liquidity;
            case 'holders':
              return b.metrics.holders.count - a.metrics.holders.count;
            case 'age':
              return b.age.days - a.age.days;
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
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/test', async (req, res) => {
  try {
    res.json({
      status: 'success',
      message: 'Test route is working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test route error:', error);
    res.status(500).json({ error: 'Test route error' });
  }
});

module.exports = router;