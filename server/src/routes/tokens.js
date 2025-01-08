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
      console.log(`Holders for ${tokenAddress}: ${result.holderCount}`);
      return result.holderCount;
    } else if (tokenAddress.length === 44 || tokenAddress.length === 43) {
      // Handle Solana tokens
      const solanaService = new SolanaService();
      const result = await solanaService.getHolderCount(tokenAddress);
      console.log(`Holders for ${tokenAddress}: ${result.holderCount}`);
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
    const [holdersData, whaleConcentration] = await Promise.all([
      whaleAnalyzer.getTopHolders(dexData.baseToken.address, dexData.baseToken.symbol),
      whaleAnalyzer.calculateWhaleConcentration(dexData.totalSupply, dexData.holders)
    ]);

    const creationDate = new Date(dexData.pairCreatedAt || new Date());
    const ageInDays = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));

    const tokenData = {
      name: dexData.baseToken?.name || 'Unknown',
      symbol: dexData.baseToken?.symbol || 'Unknown',
      address: dexData.baseToken?.address,
      age: {
        days: ageInDays,
        created: creationDate,
        isNew: ageInDays < 7
      },
      metrics: {
        fdv: parseFloat(dexData.fdv || 0),
        marketCap: parseFloat(dexData.fdv || 0),
        liquidity: parseFloat(dexData.liquidity?.usd || 0),
        priceUsd: parseFloat(dexData.priceUsd || 0),
        volume24h: parseFloat(dexData.volume?.h24 || 0),
        holders: {
          count: holdersData.holderCount,
          whaleConcentration: whaleConcentration
        }
      }
    };

    // Log only once after all data is collected
    if (tokenData.metrics.liquidity >= 50000) {
      console.log(`📈 ${tokenData.symbol.padEnd(8)} Market Cap: ${tokenData.metrics.marketCap} Liquidity: ${tokenData.metrics.liquidity} ⏰ ${ageInDays} days old 👥 ${tokenData.metrics.holders.count} holders 🐋 ${tokenData.metrics.holders.whaleConcentration}%`);
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
        const minMarketCap = 300000;
        const maxMarketCap = 15000000;

        const filteredPairs = processedPairs.filter(pair => {
            const marketCap = pair.marketCap || 0;
            const liquidity = pair.liquidity?.usd || 0;
            console.log(`Checking ${pair.baseToken.symbol}: Market Cap: $${marketCap}, Liquidity: $${liquidity}`);
            return marketCap >= minMarketCap && marketCap <= maxMarketCap && liquidity >= minLiquidity;
        });

        console.log(`Total tokens: ${processedPairs.length}`);
        console.log(`Passed filters: ${filteredPairs.length}`);
        console.log(`Min liquidity: $${minLiquidity}\n`);

        for (const pair of filteredPairs) {
            const creationDate = new Date(pair.pairCreatedAt || Date.now());  // Adjust this to the correct property
            const ageInDays = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
            const ageStr = ageInDays ? `${ageInDays} days old` : 'Unknown age';
            const marketCap = pair.marketCap ? `\x1b[94m$${pair.marketCap.toLocaleString()}\x1b[0m` : 'Unknown mcap';  // Light blue
            const liquidity = pair.liquidity?.usd ? `\x1b[92m$${pair.liquidity.usd.toLocaleString()}\x1b[0m` : 'Unknown liquidity';  // Light green
            const holders = pair.holders?.count || 'Unknown';
            const whaleConcentration = pair.holders?.whaleConcentration || 0;  // Assuming this is a percentage

            // Visual representation of whale concentration
            const whaleBar = '🐋'.repeat(Math.round(whaleConcentration / 10));  // Each whale represents 10%

            console.log(`📈 ${pair.baseToken.symbol}  Market Cap: ${marketCap}  Liquidity: ${liquidity}  ⏰ ${ageStr}  👥 ${holders} holders  🐋 ${whaleConcentration}% ${whaleBar}`);
        }

        res.json(filteredPairs);  // Send the filtered pairs as a response
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;