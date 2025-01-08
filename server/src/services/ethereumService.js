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
      const cacheKey = `holders_${tokenAddress}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return cached.data;
      }

      // Example using Etherscan (replace with actual API call)
      const etherscanResponse = await axios.get(`https://api.etherscan.io/api?module=stats&action=tokenholdercount&contractaddress=${tokenAddress}&apikey=YourApiKey`);
      
      const holderCount = etherscanResponse.data.result || 0;

      const result = { success: true, holderCount: parseInt(holderCount) };

      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data: result
      });

      return result;
    } catch (error) {
      console.error(`Error in EthereumService.getHolderCount:`, error);
      return { success: false, holderCount: 0 };
    }
  }
}

module.exports = EthereumService; 