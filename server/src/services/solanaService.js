class SolanaService {
  constructor() {
    this.connection = new web3.Connection(process.env.SOLANA_RPC_URL);
  }

  async getHolderCount(tokenAddress) {
    try {
      const mint = new web3.PublicKey(tokenAddress);
      const largestAccounts = await this.connection.getTokenLargestAccounts(mint);
      
      if (largestAccounts && largestAccounts.value) {
        return {
          success: true,
          holderCount: largestAccounts.value.length
        };
      }

      return { success: false, holderCount: 0 };
    } catch (error) {
      console.error(`Error fetching Solana holders for ${tokenAddress}:`, error.message);
      return { success: false, holderCount: 0 };
    }
  }
} 