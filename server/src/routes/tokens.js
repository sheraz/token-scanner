const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();
const SocialAnalyzer = require('../services/socialAnalysis');
const socialAnalyzer = new SocialAnalyzer(process.env.TWITTER_BEARER_TOKEN);
const WhaleAnalyzer = require('../services/whaleAnalysis');
const EthereumService = require('../services/ethereumService');
const ethereumService = new EthereumService();
const SolanaService = require('../services/solanaService');

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
      const result = await ethereumService.getHolderCount(tokenAddress);
      return result.holderCount;
    } else if (tokenAddress.length === 44 || tokenAddress.length === 43) {
      // Handle Solana tokens
      const solanaService = new SolanaService();
      const result = await solanaService.getHolderCount(tokenAddress);
      return result.holderCount;
    }
    return 0;
  } catch (error) {
    console.error(`Error in getHolderCount:`, error);
    return 0;
  }
}

const formatTokenData = async (dexData) => {
  try {
    if (!dexData.baseToken?.address) {
      return null;
    }

    // Get ALL data before any logging
    const [holders, whaleData, socialMetrics] = await Promise.all([
      getHolderCount(dexData.baseToken.address),
      whaleAnalyzer.getTopHolders(dexData.baseToken.address, dexData.baseToken.symbol),
      (async () => {
        try {
          const cacheKey = `social_${dexData.baseToken.symbol}`;
          return await socialAnalyzer.analyzeCommunity(dexData.baseToken.symbol, cacheKey);
        } catch (error) {
          return {
            tweetCount: 0,
            uniqueUsers: 0,
            engagementScore: 0,
            hourlyDistribution: new Array(24).fill(0)
          };
        }
      })()
    ]);

    const createdDate = new Date(dexData.pairCreatedAt || new Date());
    const ageInDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

    const tokenData = {
      name: dexData.baseToken?.name || 'Unknown',
      symbol: dexData.baseToken?.symbol || 'Unknown',
      address: dexData.baseToken?.address,
      age: {
        days: ageInDays,
        created: createdDate,
        isNew: ageInDays < 7
      },
      metrics: {
        fdv: parseFloat(dexData.fdv || 0),
        marketCap: parseFloat(dexData.fdv || 0),
        liquidity: parseFloat(dexData.liquidity?.usd || 0),
        priceUsd: parseFloat(dexData.priceUsd || 0),
        volume24h: parseFloat(dexData.volume?.h24 || 0),
        holders: {
          count: holders,
          whaleConcentration: whaleData.whaleConcentration,
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
        communityStrength: 0
      }
    };

    // Log only once after all data is collected
    if (tokenData.metrics.liquidity >= 50000) {
      console.log(`🔍 ${tokenData.symbol.padEnd(8)} 💰 $${tokenData.metrics.liquidity.toLocaleString()} 👥 ${holders.toLocaleString()} holders`);
    }

    return tokenData;
  } catch (error) {
    console.error('Error formatting token data:', error);
    return null;
  }
};

// Get pairs from DexScreener with proper error handling
async function searchPairs() {
    try {
        const searches = ['meme', 'memecoin'];  // Keep our working search terms
        let allPairs = [];
        
        for (const term of searches) {
            console.log(`Searching for: ${term}`);
            const response = await axios.get('https://api.dexscreener.com/latest/dex/search', {
                params: { q: term }
            });
            if (response.data.pairs) {
                allPairs = [...allPairs, ...response.data.pairs];
            }
        }
        
        return allPairs;
    } catch (error) {
        console.error('Error searching pairs:', error.message);
        return [];
    }
}

router.get('/', async (req, res) => {
  try {
    const { minHolders = 0, minLiquidity = 0, sort } = req.query;
    
    console.log('\n🔎 Starting token search...');
    console.log(`Parameters: minLiquidity=$${minLiquidity}, minHolders=${minHolders}\n`);

    let allPairs = await searchPairs();

    console.log(`Total unique pairs found: ${allPairs.length}`);
    
    // Debug liquidity values
    allPairs.forEach(pair => {
      console.log(`${pair.baseToken?.symbol}: Liquidity = $${pair.liquidity?.usd || 0}`);
    });

    // Debug creation dates with human-readable format
    console.log('\nPair Creation Dates:');
    allPairs.forEach(pair => {
        const date = new Date(pair.pairCreatedAt);
        console.log(`${pair.baseToken?.symbol}: Created ${date.toLocaleString()} (${pair.pairCreatedAt})`);
    });

    // Filter by creation time (last 120 days)
    const oneHundredTwentyDaysAgo = Date.now() - (120 * 24 * 60 * 60 * 1000);
    const timeFiltered = allPairs.filter(pair => {
        const pairCreatedAt = new Date(pair.pairCreatedAt).getTime();
        return pairCreatedAt > oneHundredTwentyDaysAgo;
    });

    console.log(`\nPairs after time filter (last 120 days): ${timeFiltered.length}`);

    // After getting timeFiltered pairs...
    console.log('\n🔍 Debugging Holder Data:');
    
    // Look at first 3 tokens in detail
    timeFiltered.slice(0, 3).forEach(pair => {
        console.log(`\n${pair.baseToken?.symbol || 'Unknown Token'}:`);
        console.log('1. Full Token Data:');
        console.log(JSON.stringify(pair.baseToken, null, 2));
        
        console.log('\n2. Holder-related fields:');
        console.log('- pair.holders:', pair.holders);
        console.log('- pair.baseToken.holders:', pair.baseToken?.holders);
        console.log('- pair.baseToken.holderCount:', pair.baseToken?.holderCount);
        
        console.log('\n3. Token Address:', pair.baseToken?.address);
    });

    // Now apply liquidity, market cap, and holders filters
    allPairs = timeFiltered.filter(pair => {
        const liquidity = parseFloat(pair.liquidity?.usd) || 0;
        const marketCap = parseFloat(pair.fdv) || 0;
        const holders = parseInt(pair.holders) || 0;
        
        const meetsLiquidity = liquidity >= minLiquidity;
        const meetsMarketCap = marketCap >= 300000 && marketCap <= 15000000;
        const meetsHolders = holders >= minHolders;

        if (!meetsLiquidity) {
            console.log(`Filtered out ${pair.baseToken?.symbol}: Liquidity $${liquidity} < $${minLiquidity}`);
        } else if (!meetsMarketCap) {
            console.log(`Filtered out ${pair.baseToken?.symbol}: Market Cap $${marketCap} outside range $300k-$15M`);
        } else if (!meetsHolders) {
            console.log(`Filtered out ${pair.baseToken?.symbol}: Holders ${holders} < ${minHolders}`);
        }

        return meetsLiquidity && meetsMarketCap && meetsHolders;
    });

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