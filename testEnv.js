import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('Client ID:', process.env.REDDIT_CLIENT_ID);
console.log('Client Secret:', process.env.REDDIT_CLIENT_SECRET);
console.log('Username:', process.env.REDDIT_USERNAME);
console.log('Password:', process.env.REDDIT_PASSWORD);
