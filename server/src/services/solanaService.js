const web3 = require('@solana/web3.js');
const axios = require('axios');

class SolanaService {
  constructor() {
    this.connection = new web3.Connection(process.env.SOLANA_RPC_URL);
  }

  async getHolderCount(tokenAddress) {
    try {
      console.log('SolanaService.getHolderCount called for:', tokenAddress);
      // Example using a Solana API (replace with actual API call)
      const response = await axios.get(`https://api.solana.com/holders/${tokenAddress}`);
      
      const holderCount = response.data.holderCount || 0;

      return { success: true, holderCount: parseInt(holderCount) };
    } catch (error) {
      console.error(`Error in SolanaService.getHolderCount:`, error);
      return { success: false, holderCount: 0 };
    }
  }
}

module.exports = SolanaService; 