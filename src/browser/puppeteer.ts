import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// @ts-ignore
import ChromeAppPlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.app';
// @ts-ignore
import ChromeCsiPlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.csi';
// @ts-ignore
import ChromeLoadTimesPlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes';
// @ts-ignore
import ChromeRuntimePlugin from 'puppeteer-extra-plugin-stealth/evasions/chrome.runtime';
// @ts-ignore
import DefaultArgsPlugin from 'puppeteer-extra-plugin-stealth/evasions/defaultArgs';
// @ts-ignore
import IFrameContentWindowPlugin from 'puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow';
// @ts-ignore
import MediaCodecsPlugin from 'puppeteer-extra-plugin-stealth/evasions/media.codecs';
// @ts-ignore
import NavigatorHardwareConcurrencyPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency';
// @ts-ignore
import NavigatorLanguagesPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.languages';
// @ts-ignore
import NavigatorPermissionsPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.permissions';
// @ts-ignore
import NavigatorPlugins from 'puppeteer-extra-plugin-stealth/evasions/navigator.plugins';
// @ts-ignore
import WebdriverPlugin from 'puppeteer-extra-plugin-stealth/evasions/navigator.webdriver';
// @ts-ignore
import SourceUrlPlugin from 'puppeteer-extra-plugin-stealth/evasions/sourceurl';
// @ts-ignore
import UserAgentOverridePlugin from 'puppeteer-extra-plugin-stealth/evasions/user-agent-override';
// @ts-ignore
import WebglVendorPlugin from 'puppeteer-extra-plugin-stealth/evasions/webgl.vendor';
// @ts-ignore
import WindowOuterDimensionsPlugin from 'puppeteer-extra-plugin-stealth/evasions/window.outerdimensions';
// @ts-ignore
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
// @ts-ignore
import UserDataDirPlugin from 'puppeteer-extra-plugin-user-data-dir';

// Apply stealth plugins
puppeteer.use(StealthPlugin());
puppeteer.use(ChromeAppPlugin());
puppeteer.use(ChromeCsiPlugin());
puppeteer.use(ChromeLoadTimesPlugin());
puppeteer.use(ChromeRuntimePlugin());
puppeteer.use(DefaultArgsPlugin());
puppeteer.use(IFrameContentWindowPlugin());
puppeteer.use(MediaCodecsPlugin());
puppeteer.use(NavigatorHardwareConcurrencyPlugin());
puppeteer.use(NavigatorLanguagesPlugin());
puppeteer.use(NavigatorPermissionsPlugin());
puppeteer.use(NavigatorPlugins());
puppeteer.use(WebdriverPlugin());
puppeteer.use(SourceUrlPlugin());
puppeteer.use(UserAgentOverridePlugin());
puppeteer.use(WebglVendorPlugin());
puppeteer.use(WindowOuterDimensionsPlugin());
puppeteer.use(UserPreferencesPlugin());
puppeteer.use(UserDataDirPlugin());

export default puppeteer;
