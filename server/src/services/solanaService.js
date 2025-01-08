const web3 = require('@solana/web3.js');

class SolanaService {
  constructor() {
    this.connection = new web3.Connection(process.env.SOLANA_RPC_URL);
  }

  async getHolderCount(tokenAddress) {
    // For now, return 0 to avoid rate limiting
    return { success: true, holderCount: 0 };
  }
}

module.exports = SolanaService; 