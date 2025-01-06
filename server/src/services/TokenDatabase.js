// Simple in-memory database to store tokens
class TokenDatabase {
    constructor() {
      this.tokens = []; // Array to store token data
    }
  
    // Method to save a token to the "database"
    async saveToken(tokenData) {
      this.tokens.push(tokenData); // Add token to array
      console.log('Token saved:', tokenData);
    }
  
    // Method to retrieve all stored tokens
    async getAllTokens() {
      return this.tokens;
    }
  
    // You could add more methods here to query or manipulate token data
  }
  
  module.exports = TokenDatabase;
  