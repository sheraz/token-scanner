console.log('Loading WhaleAnalyzer module');

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const axios = require('axios');
const EthereumService = require('./ethereumService');
const SolanaService = require('./solanaService');

class WhaleAnalyzer {
  constructor() {
    console.log('Current directory:', __dirname);
    console.log('Log directory path:', path.join(__dirname, '../../logs'));
    
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000;
    this.lastRequestTime = 0;
    this.minRequestInterval = 500;
    
    this.logDir = path.join(__dirname, '../../logs');
    this.maxLogSize = 5 * 1024 * 1024;
    this.maxLogFiles = 3;

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
      console.log('Created log directory at:', this.logDir);
    }

    this.ethereumService = new EthereumService();
    this.solanaService = new SolanaService();
  }

  async getTopHolders(tokenAddress, tokenSymbol) {
    try {
      console.log(`Fetching holders for: ${tokenSymbol} (${tokenAddress})`);
      const cacheKey = `holders_${tokenAddress}`;
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheTimeout) {
          console.log(`Using cached data for: ${tokenSymbol}`);
          return cached.data;
        }
      }

      let holderCount = 0;
      let totalSupply = 0;

      if (tokenAddress.startsWith('0x')) {
        const ethData = await this.ethereumService.getHolderCount(tokenAddress);
        console.log(`Ethereum data for ${tokenSymbol}:`, ethData);
        holderCount = parseInt(ethData.holderCount) || 0;
      } else if (tokenAddress.length === 44 || tokenAddress.length === 43) {
        const solData = await this.solanaService.getHolderCount(tokenAddress);
        console.log(`Solana data for ${tokenSymbol}:`, solData);
        holderCount = parseInt(solData.holderCount) || 0;
      }

      const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
      const response = await axios.get(dexUrl);
      console.log(`DexScreener response for ${tokenSymbol}:`, response.data);
      
      if (response.data.pairs && response.data.pairs.length > 0) {
        const pair = response.data.pairs[0];
        totalSupply = parseFloat(pair.totalSupply || 0);
      }

      const result = { totalSupply, holderCount };
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data: result
      });

      console.log(`Holders for ${tokenSymbol}: ${holderCount}, Total Supply: ${totalSupply}`);
      return result;
    } catch (error) {
      console.error(`Error processing ${tokenSymbol}: ${error.message}`);
      return { totalSupply: 0, holderCount: 0 };
    }
  }

  processTransfers(transfers) {
    if (!transfers || !Array.isArray(transfers)) {
      console.log('No transfers to process');
      return [];
    }
    
    const balances = new Map();
    
    for (const tx of transfers) {
      if (!tx.from || !tx.to || !tx.value) {
        console.log('Invalid transfer:', tx);
        continue;
      }

      const from = tx.from.toLowerCase();
      const to = tx.to.toLowerCase();
      const value = parseFloat(tx.value) / 1e18;
      
      if (!balances.has(from)) balances.set(from, 0);
      if (!balances.has(to)) balances.set(to, 0);
      
      balances.set(from, balances.get(from) - value);
      balances.set(to, balances.get(to) + value);
    }
    
    const holders = Array.from(balances.entries())
      .map(([address, balance]) => ({ address, balance }))
      .filter(h => h.balance > 0)
      .sort((a, b) => b.balance - a.balance);

    console.log(`Found ${holders.length} holders with positive balances`);
    if (holders.length > 0) {
      console.log('Largest holder balance:', holders[0].balance);
    }
    return holders;
  }

  calculateWhaleConcentration(totalSupply, holders) {
    if (!holders || !Array.isArray(holders) || holders.length === 0 || totalSupply <= 0) {
      return 0;
    }

    const top3Sum = holders.slice(0, 3)
      .reduce((sum, h) => sum + (h.balance || 0), 0);
    
    const concentration = (top3Sum / totalSupply) * 100;
    console.log(`Whale concentration: ${concentration}%`);
    return concentration;
  }

  async formatTokenData(tokenSymbol, liquidity, whaleData = {}) {
    try {
      const result = {
        liquidity: parseFloat(liquidity),
        holders: whaleData.whaleConcentration > 0 ? 1 : 0,
        whaleConcentration: whaleData.whaleConcentration || 0
      };

      await this.log(tokenSymbol, {
        type: 'formatted_data',
        ...result
      });

      return result;
    } catch (error) {
      console.error(`Error formatting data for ${tokenSymbol}:`, error);
      return {
        liquidity: parseFloat(liquidity),
        holders: 0,
        whaleConcentration: 0
      };
    }
  }

  async log(tokenSymbol, data) {
    try {
      console.log('Attempting to log data for:', tokenSymbol);
      console.log('Log directory:', this.logDir);
      
      const currentDate = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logDir, `whale-analysis-${currentDate}.log`);
      console.log('Writing to log file:', logFile);
      
      const logEntry = JSON.stringify({
        timestamp: new Date().toISOString(),
        token: tokenSymbol,
        ...data
      }, null, 2) + '\n\n';

      await fsPromises.mkdir(this.logDir, { recursive: true });
      
      await fsPromises.writeFile(logFile, logEntry, { flag: 'a' });
      console.log('Successfully wrote log entry');
    } catch (error) {
      console.error('Logging failed:', error);
      console.error('Error details:', {
        dir: this.logDir,
        error: error.message,
        stack: error.stack
      });
    }
  }

  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }
}

module.exports = WhaleAnalyzer;
