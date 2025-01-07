const axios = require('axios');

class WhaleAnalyzer {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async getTopHolders(tokenAddress) {
    try {
      if (tokenAddress.startsWith('0x')) {
        // Ethereum token
        const response = await axios.get(`https://api.etherscan.io/api`, {
          params: {
            module: 'token',
            action: 'tokenholderlist',
            contractaddress: tokenAddress,
            page: 1,
            offset: 10, // Get top 10 holders
            apikey: process.env.ETHERSCAN_API_KEY
          }
        });

        if (response.data.status === '1') {
          return response.data.result;
        }
      } else if (tokenAddress.length === 44 || tokenAddress.length === 43) {
        // Solana token
        const response = await axios.post('https://api.mainnet-beta.solana.com', {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTokenLargestAccounts',
          params: [tokenAddress]
        });

        if (response.data?.result?.value) {
          return response.data.result.value;
        }
      }
      return [];
    } catch (error) {
      console.error(`Error fetching top holders for ${tokenAddress}:`, error.message);
      return [];
    }
  }

  async calculateWhaleConcentration(tokenAddress) {
    const cacheKey = `whale_${tokenAddress}`;
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    const topHolders = await this.getTopHolders(tokenAddress);
    let whaleConcentration = 0;

    if (topHolders.length > 0) {
      // Calculate percentage held by top holders
      const totalSupply = topHolders.reduce((sum, holder) => sum + parseFloat(holder.balance || holder.uiAmount || 0), 0);
      const topHoldersSum = topHolders.slice(0, 3).reduce((sum, holder) => sum + parseFloat(holder.balance || holder.uiAmount || 0), 0);
      whaleConcentration = (topHoldersSum / totalSupply) * 100;
    }

    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data: whaleConcentration
    });

    return whaleConcentration;
  }
}

module.exports = WhaleAnalyzer;
