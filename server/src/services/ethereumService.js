const axios = require('axios');

class EthereumService {
  constructor() {
    this.lastCallTime = 0;
    this.RATE_LIMIT_MS = 250; // 4 calls per second to be safe
  }

  async getHolderCount(tokenAddress) {
    try {
      // Add rate limiting
      const now = Date.now();
      const timeToWait = Math.max(0, this.RATE_LIMIT_MS - (now - this.lastCallTime));
      if (timeToWait > 0) {
        await new Promise(resolve => setTimeout(resolve, timeToWait));
      }
      this.lastCallTime = Date.now();

      const response = await axios.get(`https://api.etherscan.io/api`, {
        params: {
          module: 'token',
          action: 'tokenholderlist',
          contractaddress: tokenAddress,
          apikey: process.env.ETHERSCAN_API_KEY
        }
      });

      if (response.data.status === '1' && response.data.result) {
        return { success: true, holderCount: response.data.result.length };
      }

      return { success: false, holderCount: 0 };
    } catch (error) {
      console.error(`Error fetching Ethereum holders: ${error.message}`);
      return { success: false, holderCount: 0 };
    }
  }
}

module.exports = EthereumService; 