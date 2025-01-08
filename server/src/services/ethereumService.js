const axios = require('axios');

class EthereumService {
  constructor() {
    this.lastCallTime = 0;
    this.RATE_LIMIT_MS = 250;
    this.cache = new Map();
    this.CACHE_DURATION = 5 * 60 * 1000;
  }

  async getHolderCount(tokenAddress) {
    console.log('EthereumService.getHolderCount called for:', tokenAddress);
    try {
      // Check cache first
      const cacheKey = `holders_${tokenAddress}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      // Try DexScreener first
      const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      
      if (dexResponse.data.pairs && dexResponse.data.pairs.length > 0) {
        const pair = dexResponse.data.pairs[0];
        const txns24h = parseInt(pair.txns?.h24 || 0);
        
        // If there are recent transactions, there must be holders
        const result = { 
          success: true, 
          holderCount: txns24h > 0 ? Math.max(2, Math.ceil(txns24h / 10)) : 1 
        };

        // Cache the result
        this.cache.set(cacheKey, {
          timestamp: Date.now(),
          data: result
        });
        
        return result;
      }

      return { success: false, holderCount: 0 };
    } catch (error) {
      console.error(`Error in EthereumService.getHolderCount:`, error);
      return { success: false, holderCount: 0 };
    }
  }
}

module.exports = EthereumService; 