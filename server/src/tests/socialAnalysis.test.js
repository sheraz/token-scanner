const path = require('path');
const SocialAnalyzer = require('../services/socialAnalysis');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

console.log('Environment check:');
console.log('Working directory:', process.cwd());
console.log('Token exists:', !!process.env.TWITTER_BEARER_TOKEN);
console.log('Token prefix:', process.env.TWITTER_BEARER_TOKEN?.substring(0, 10));

async function testAnalysis() {
  const analyzer = new SocialAnalyzer(process.env.TWITTER_BEARER_TOKEN);
  const result = await analyzer.analyzeCommunity('PEPE');
  console.log('Analysis result:', result);
}

testAnalysis();