// Import necessary modules
const { getDexScreenerData, getEtherscanData, getCoinGeckoData } = require('./api'); // Correct the relative path
const SocialScraper = require('./SocialScraper'); // Import the SocialScraper
const TokenDatabase = require('./TokenDatabase'); // Import TokenDatabase

class TokenScanner {
  constructor() {
    this.socialScraper = new SocialScraper();  // Creating an instance of SocialScraper
    this.db = new TokenDatabase();  // Creating an instance of TokenDatabase
  }

  // Function to scan a single token address
  async scanToken(address) {
    try {
      // Fetch data from APIs
      const dexData = await getDexScreenerData(address);
      const etherscanData = await getEtherscanData(address);
      
      // Initialize an empty object for social metrics
      let socialMetrics = {};

      // Check if Twitter handle exists in Etherscan data
      if (etherscanData.result.twitter) {
        // Fetch Twitter metrics if available from Nitter (Twitter mirror)
        socialMetrics.twitter = await this.socialScraper.getNitterMetrics(etherscanData.result.twitter);
      }

      // Check if Telegram group link exists
      if (etherscanData.result.telegram) {
        // Fetch Telegram group metrics if available
        socialMetrics.telegram = await this.socialScraper.getTelegramGroupMetrics(etherscanData.result.telegram);
      }

      // Format token data to be saved
      const tokenData = {
        address,
        name: dexData.pairs[0].baseToken.name,
        symbol: dexData.pairs[0].baseToken.symbol,
        marketCap: dexData.pairs[0].fdv,
        liquidity: dexData.pairs[0].liquidity.usd,
        holders: etherscanData.result.holders,
        launchDate: dexData.pairs[0].createTime,
        socialMetrics // Include social metrics
      };

      // Save token data to the database
      await this.db.saveToken(tokenData);
      return tokenData;  // Return token data
    } catch (error) {
      // Log error if something goes wrong
      console.error(`Error scanning token ${address}:`, error);
      return null;
    }
  }

  // Function to scan a list of tokens (example addresses)
  async scanNewTokens() {
    const tokenAddresses = ['0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C', 'HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC', '0x626e8036deb333b408be468f951bdb42433cbf18']; // Example token addresses

    for (let address of tokenAddresses) {
      await this.scanToken(address); // Scan each token in the list
    }
  }
}

module.exports = TokenScanner;  // Export the TokenScanner class for use in other files
