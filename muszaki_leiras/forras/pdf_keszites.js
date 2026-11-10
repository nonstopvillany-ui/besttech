// PDF készítése a szerkeszthető HTML-forrásból (Chromium / Playwright).
// Használat:  node pdf_keszites.js [kimenet.pdf]
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'BESTTECH_Muszaki_Leiras_8_oldal.pdf'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(__dirname, 'index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true,
                   margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  await browser.close();
  console.log('Kész: ' + out);
})();
