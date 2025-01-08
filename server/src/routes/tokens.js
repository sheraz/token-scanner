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

// Search function
async function searchPairs() {
   try {
        const searches = ['meme', 'memecoin'];
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

// Main route handler
router.get('/', async (req, res) => {
    try {
        const minLiquidity = parseFloat(req.query.minLiquidity) || 50000;
        const minHolders = parseInt(req.query.minHolders) || 0;

        console.log('\n🔎 Starting token search...');
        console.log(`Parameters: minLiquidity=$${minLiquidity}, minHolders=${minHolders}\n`);

        // Get pairs using our search function
        const pairs = await searchPairs();
        
        // Remove the holder processing section
        console.log('\n🔄 Processing pairs...');
        const processedPairs = pairs;  // Just pass through the pairs without holder processing
        
        // Update the filtering and display
        console.log('\n🔍 Filtering processed pairs...');
        allPairs = processedPairs.filter(pair => {
            console.log(`\nChecking ${pair.baseToken.symbol}:`);
            console.log(`Market Cap: $${pair.marketCap}`);
            console.log(`Liquidity: $${pair.liquidity?.usd || pair.liquidity}`);

            if (pair.marketCap < 300000 || pair.marketCap > 15000000) {
                console.log(`Filtered out ${pair.baseToken.symbol}: Market Cap $${pair.marketCap} outside range $300k-$15M`);
                return false;
            }
            
            const liquidityUsd = pair.liquidity?.usd || pair.liquidity;
            if (liquidityUsd < minLiquidity) {
                console.log(`Filtered out ${pair.baseToken.symbol}: Liquidity $${liquidityUsd} < $${minLiquidity}`);
                return false;
            }

            console.log(`✅ ${pair.baseToken.symbol} passed all filters`);
            return true;
        });

        // Print summary
        console.log('\n📊 Filtering Summary:');
        console.log(`Total tokens: ${processedPairs.length}`);
        console.log(`Passed filters: ${allPairs.length}`);
        console.log(`Min liquidity: $${minLiquidity}`);

        console.log('\nReturning', allPairs.length, 'tokens after filtering\n');

        // Update the display format to include age
        allPairs.forEach(pair => {
            const ageStr = pair.age ? `⏰ ${pair.age}d` : '⏰ Unknown';
            console.log(`🔍 ${pair.baseToken.symbol}  💰 $${pair.marketCap.toFixed(2)}  ${ageStr}`);
        });

        // After getting timeFiltered pairs...
        console.log('\n🔄 Processing pairs for creation dates...');

        for (const pair of pairs) {
            console.log(`\nProcessing ${pair.baseToken?.symbol}...`);
            
            if (pair.baseToken?.address?.startsWith('0x')) {  // Ethereum token
                try {
                    const url = `https://deep-index.moralis.io/api/v2.2/${pair.baseToken.address}/logs?limit=1&order=ASC`;
                    console.log('Calling Moralis:', url);
                    console.log('Token address:', pair.baseToken.address);
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: {
                            'accept': 'application/json',
                            'X-API-Key': process.env.MORALIS_API_KEY
                        }
                    });
                    
                    console.log('Moralis response status:', response.status);
                    const responseText = await response.text();
                    console.log('Response body:', responseText);
                    
                    if (!response.ok) {
                        console.error('Error response received');
                        pair.age = null;
                        continue;
                    }
                    
                    const data = JSON.parse(responseText);
                    console.log('Parsed data:', JSON.stringify(data, null, 2));
                    
                    if (data && data.result && data.result[0]) {
                        const firstLog = data.result[0];
                        const createdAt = new Date(firstLog.block_timestamp);
                        pair.createdAt = createdAt;
                        const daysOld = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
                        pair.age = daysOld;
                        console.log(`Token created ${daysOld} days ago (${createdAt.toISOString()})`);
                    } else {
                        console.log('No logs found in response');
                        pair.age = null;
                    }
                    
                } catch (error) {
                    console.error(`Error fetching logs for ${pair.baseToken.symbol}:`, error);
                    pair.age = null;
                }
            } else {
                console.log('Not an ETH token:', pair.baseToken);
                pair.age = null;
            }
        }

        // Send response
        res.json({ 
            success: true,
            count: allPairs.length,
            pairs: allPairs 
        });
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