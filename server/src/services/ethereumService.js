class EthereumService {
  constructor() {
    this.apiKey = process.env.ETHERSCAN_API_KEY;
    this.baseUrl = 'https://api.etherscan.io/api';
  }

  async getHolderCount(tokenAddress) {
    try {
      const url = `${this.baseUrl}?module=token&action=tokenholderlist&contractaddress=${tokenAddress}&apikey=${this.apiKey}`;
      const response = await axios.get(url);
      
      if (response.data.status === '1') {
        return {
          success: true,
          holderCount: parseInt(response.data.result) || 0
        };
      }
      
      return { success: false, holderCount: 0 };
    } catch (error) {
      console.error(`Error fetching Ethereum holders for ${tokenAddress}:`, error.message);
      return { success: false, holderCount: 0 };
    }
  }
} 