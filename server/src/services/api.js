const axios = require('axios');

// Function to get DexScreener data
const getDexScreenerData = async (address) => {
  try {
    const response = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/${address}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching DexScreener data:', error);
    throw error; // Rethrow the error for further handling
  }
};

// Function to get Etherscan data
const getEtherscanData = async (address) => {
  try {
    const response = await axios.get(`https://api.etherscan.io/api?module=contract&action=getabi&address=${address}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching Etherscan data:', error);
    throw error; // Rethrow the error for further handling
  }
};

// Function to get CoinGecko data
const getCoinGeckoData = async (address) => {
  try {
    const response = await axios.get(`https://api.coingecko.com/api/v3/coins/ethereum/contract/${address}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching CoinGecko data:', error);
    throw error; // Rethrow the error for further handling
  }
};

// Export the functions
module.exports = {
  getDexScreenerData,
  getEtherscanData,
  getCoinGeckoData,
};
