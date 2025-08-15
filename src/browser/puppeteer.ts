import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply stealth plugin (this includes most evasions automatically)
puppeteer.use(StealthPlugin());

export default puppeteer;
