// src/services/SocialScraper.js

const puppeteer = require('puppeteer');

class SocialScraper {
  constructor() {
    this.browser = null;
  }

  // Initialize Puppeteer browser
  async init() {
    this.browser = await puppeteer.launch({
      headless: true,  // Run headless (no UI)
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // Scrape Nitter (Twitter Mirror) for user data
  async getNitterMetrics(username) {
    if (!this.browser) await this.init();

    const instances = [
      'https://nitter.1d4.us',
      'https://nitter.pussthecat.org',
      'https://nitter.moomoo.me'
    ];

    for (const instance of instances) {
      try {
        const page = await this.browser.newPage();
        await page.goto(`${instance}/${username}`, { waitUntil: 'domcontentloaded' });

        const metrics = await page.evaluate(() => {
          const followersText = document.querySelector('a[href$="/followers"] span')?.textContent || '0';
          const tweetsText = document.querySelector('a[href$="/statuses"] span')?.textContent || '0';

          return {
            followers: parseInt(followersText.replace(/\D/g, ''), 10),
            tweets: parseInt(tweetsText.replace(/\D/g, ''), 10),
          };
        });

        await page.close();
        return metrics;
      } catch (error) {
        console.warn(`Failed to fetch from ${instance}, trying next instance...`);
      }
    }

    throw new Error('All Nitter instances are unreachable');
  }

  // Scrape Telegram group data (if publicly available)
  async getTelegramGroupMetrics(groupLink) {
    if (!this.browser) await this.init();

    const page = await this.browser.newPage();
    await page.goto(groupLink, { waitUntil: 'domcontentloaded' });

    // Scraping Telegram group members (this is a simple version, needs to handle cases where data is hidden)
    const members = await page.evaluate(() => {
      const memberCountText = document.querySelector('span:contains("members")')?.textContent || '0 members';
      const memberCount = memberCountText.match(/\d+/) ? parseInt(memberCountText.match(/\d+/)[0], 10) : 0;
      return memberCount;
    });

    await page.close();
    return { members };
  }

  // Method to scrape both Nitter and Telegram data
  async getSocialMetrics(twitterHandle, telegramLink) {
    const twitterData = await this.getNitterMetrics(twitterHandle);
    const telegramData = await this.getTelegramGroupMetrics(telegramLink);

    return {
      twitter: twitterData,
      telegram: telegramData,
    };
  }

  // Close browser when done
  async close() {
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = SocialScraper;
