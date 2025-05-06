const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer'); // NEW: Import puppeteer
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Load .env from parent directory

const OUTPUT_DIR = path.resolve(__dirname, '../public/tokens');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// NEW: Function to get existing logos
function getExistingLogos(directory) {
    try {
        const files = fs.readdirSync(directory);
        return new Set(files.map(file => path.parse(file).name.toLowerCase())); // store as lowercase without extension
    } catch (error) {
        console.error(`Error reading directory ${directory}:`, error);
        return new Set(); // Return empty set if directory cannot be read
    }
}

// NEW: Function to scrape coin data from CoinMarketCap
async function scrapeCoinDataFromCMC() {
    console.log('Launching browser to scrape CoinMarketCap...');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const cmcUrl = 'https://coinmarketcap.com/';
    console.log(`Navigating to ${cmcUrl}...`);
    try {
        await page.goto(cmcUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
        console.error(`Error navigating to ${cmcUrl}:`, e);
        await browser.close();
        return [];
    }

    // NEW: Attempt to dismiss cookie consent banner
    console.log('Attempting to dismiss cookie consent banner...');
    try {
        // Common texts/patterns for cookie accept buttons
        const acceptButtonXPaths = [
            '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "accept")]',
            '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "agree")]',
            '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "got it")]',
            '//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "allow all")]',
            '//div[contains(@class, "banner")]//button[contains(translate(., "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz"), "ok")]',
            '//button[@id="onetrust-accept-btn-handler"]' // Common ID for OneTrust banners
        ];

        let bannerClicked = false;
        for (const xpath of acceptButtonXPaths) {
            const clicked = await page.evaluate((xpathStr) => {
                try {
                    const button = document.evaluate(xpathStr, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    if (button && button instanceof HTMLElement && button.offsetParent !== null) {
                        button.click();
                        return true;
                    }
                    return false;
                } catch (err) {
                    return false;
                }
            }, xpath);

            if (clicked) {
                console.log(`Clicked a cookie consent button using XPath: ${xpath}`);
                bannerClicked = true;
                await new Promise(r => setTimeout(r, 2000)); // Wait for banner to disappear
                break;
            }
        }
        if (!bannerClicked) {
            console.log('No common cookie consent button found or clicked. Proceeding...');
        }
    } catch (e) {
        console.warn('Error attempting to dismiss cookie banner:', e.message);
    }
    // END NEW: Cookie consent dismissal

    // NEW: Attempt to set row count to 200 or 100
    console.log('Attempting to set row count (prefer 200, then 100)...');
    try {
        const dropdownTriggerSelector = 'div[data-role="select-trigger"]';
        const potentialTriggers = await page.$$(dropdownTriggerSelector);
        let tableRowsDropdownTrigger = null;
        if (potentialTriggers.length > 0) {
            for (const trigger of potentialTriggers) {
                const textContent = await trigger.evaluate(el => el.textContent);
                if (textContent && (textContent.includes('Show 10') || textContent.includes('Show 20') || textContent.includes('Show 50'))) {
                    tableRowsDropdownTrigger = trigger;
                    console.log('Found potential rows dropdown trigger with text:', textContent);
                    break;
                }
            }
        }
        if (tableRowsDropdownTrigger) {
            await tableRowsDropdownTrigger.click();
            await new Promise(r => setTimeout(r, 1500));
            let selectedOption = false;
            const rowCountOptionsToTry = ['500', '200', '100']; // PREFER 500, then 200, then 100
            for (const count of rowCountOptionsToTry) {
                const optionXPath = `//div[contains(@class, 'OptionItem_base') and .//div[contains(text(), '${count}')]] | //div[contains(@class, 'tippy-content')]//div[contains(text(), '${count}')] | //li[contains(., '${count}')] | //button[contains(., '${count}')]`;
                const clickedViaEvaluate = await page.evaluate((xpathForEval) => {
                    try {
                        const results = [];
                        const query = document.evaluate(xpathForEval, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                        let node = query.iterateNext();
                        while (node) {
                            // Basic visibility check: node is an HTMLElement and is part of the rendered layout
                            if (node instanceof HTMLElement && node.offsetParent !== null) {
                                results.push(node);
                            }
                            node = query.iterateNext();
                        }

                        if (results.length > 0) {
                            // Attempt to click the first visible result found by XPath
                            results[0].click(); 
                            return true; // Click attempted
                        }
                        return false; // No suitable element found or clicked
                    } catch (err) {
                        // console.error inside evaluate will go to browser console.
                        // To pass error info back to Node.js, return an object.
                        return { error: err.toString(), errorMessage: err.message };
                    }
                }, optionXPath); // Pass the dynamically generated optionXPath to page.evaluate

                if (clickedViaEvaluate === true) {
                    console.log(`Clicked option for "${count}" rows.`);
                    selectedOption = true;
                    await Promise.race([
                        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                        page.waitForNetworkIdle({ idleTime: 3000, timeout: 15000 })
                    ]).catch(e => console.warn('Wait after row count change had minor issue or timed out, proceeding:', e.message));
                    console.log('Proceeding after attempting to set row count.');
                    break;
                } else if (typeof clickedViaEvaluate === 'object' && clickedViaEvaluate.error) {
                    console.warn(`Error during page.evaluate for XPath click for "${count}" rows: ${clickedViaEvaluate.errorMessage || clickedViaEvaluate.error}`);
                } else {
                    console.log(`Option for "${count}" rows not found or clicked via page.evaluate.`);
                }
            }

            if (!selectedOption) {
                console.warn('Could not click "200" or "100" rows option.');
            }
        } else {
            console.warn('Could not find dropdown trigger for row count.');
        }
    } catch (e) {
        console.error('Error setting row count:', e.message);
    }
    // END NEW: Attempt to set row count

    // NEW iterative scraping logic for virtual scrolling
    console.log('Starting iterative scraping for virtual scroll...');
    let allCoinData = [];
    let seenSymbols = new Set();
    const MAX_SCROLL_ATTEMPTS = 90; // Target 500, so more attempts
    const TARGET_COIN_COUNT = 500; // Target 500 unique coins
    let noNewCoinsStreak = 0;

    const tableBodySelector = 'table.cmc-table tbody'; // Keep this selector for consistency

    for (let scrollAttempt = 0; scrollAttempt < MAX_SCROLL_ATTEMPTS; scrollAttempt++) {
        console.log(`Scrape attempt ${scrollAttempt + 1}, current unique coins: ${allCoinData.length}`);
        
        // Wait for at least a part of the table to be present before scraping this iteration
        try {
            await page.waitForSelector(`${tableBodySelector} tr`, { timeout: 10000 });
        } catch (e) {
            console.warn(`Table rows not found in attempt ${scrollAttempt + 1}, possibly end of list or error. Error: ${e.message}`);
            break; // Stop if table rows aren't appearing
        }

        const newCoinsInBatch = await page.evaluate((selector) => {
            const rows = Array.from(document.querySelectorAll(`${selector} tr`));
            const data = [];
            // Scrape all currently rendered rows in the DOM query
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const nameElement = row.querySelector('p.coin-item-name');
                const symbolElement = row.querySelector('p.coin-item-symbol');
                const logoElement = row.querySelector('img.coin-logo');
                if (nameElement && symbolElement && logoElement) {
                    const name = nameElement.innerText.trim();
                    const symbol = symbolElement.innerText.trim();
                    const logoUrl = logoElement.src;
                    if (name && symbol && logoUrl) {
                        data.push({ name, symbol, logoUrl });
                    }
                }
            }
            return data;
        }, tableBodySelector);

        let foundNewThisScroll = false;
        if (newCoinsInBatch.length > 0) {
            for (const coin of newCoinsInBatch) {
                if (!seenSymbols.has(coin.symbol)) {
                    allCoinData.push(coin);
                    seenSymbols.add(coin.symbol);
                    foundNewThisScroll = true;
                }
            }
        }

        if (foundNewThisScroll) {
            noNewCoinsStreak = 0; // Reset streak if new coins were found
            console.log(`Found ${newCoinsInBatch.length} coins in this batch, ${allCoinData.length} unique total.`);
        } else {
            noNewCoinsStreak++;
            console.log(`No new unique coins in this batch (attempt ${scrollAttempt + 1}). Streak: ${noNewCoinsStreak}`);
        }

        if (allCoinData.length >= TARGET_COIN_COUNT) {
            console.log(`Reached or exceeded target of ${TARGET_COIN_COUNT} unique coins.`);
            break;
        }

        if (noNewCoinsStreak >= 3 && scrollAttempt > 5) { // Stop if no new coins for 3 consecutive scrolls after a few initial attempts
            console.log('No new coins found for several consecutive scrolls. Assuming end of list.');
            break;
        }

        // Scroll down
        await page.evaluate(() => { 
            window.scrollBy(0, window.innerHeight * 0.85); // Scroll 85% of viewport
        });
        console.log('Scrolled down, waiting for new content...');
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000)); // Wait 2-3 seconds for content to load

        if (scrollAttempt === MAX_SCROLL_ATTEMPTS - 1) {
            console.log('Max scroll attempts reached.');
        }
    }

    console.log(`Finished iterative scraping. Total unique coins extracted: ${allCoinData.length}`);
    await browser.close();
    console.log('Browser closed.');
    return allCoinData;
}

async function downloadImage(url, filepath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Error downloading image from ${url}: ${response.status} ${response.statusText}`);
            const errorBody = await response.text(); // Attempt to get more error details
            console.error(`Error details: ${errorBody}`);
            return false;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filepath, buffer);
        console.log(`Successfully downloaded and saved: ${filepath}`);
        return true;
    } catch (error) {
        console.error(`Error downloading image ${url}:`, error);
        return false;
    }
}

async function main() {
    console.log('Starting logo download process using web scraping...'); // Updated log
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    const existingLogos = getExistingLogos(OUTPUT_DIR);
    const scrapedCoins = await scrapeCoinDataFromCMC(); // NEW: Get data from scraping

    if (!scrapedCoins || scrapedCoins.length === 0) {
        console.error('No coin data was scraped. Exiting.');
        return;
    }

    for (const coin of scrapedCoins) { // Iterate over scraped data
        const targetSymbolLower = coin.symbol.toLowerCase(); // Use lowercase for checking and saving

        if (existingLogos.has(targetSymbolLower)) {
            // console.log(`Logo for ${coin.name} (${coin.symbol} - ${targetSymbolLower}.png) already exists. Skipping.`); // Too verbose for many coins
            skippedCount++;
            continue; 
        }

        console.log(`
Processing ${coin.name} (${coin.symbol})... Logo URL: ${coin.logoUrl}`);

        // const logoUrl = await fetchLogoUrl(cmcId); // Old logic, replaced by coin.logoUrl

        if (coin.logoUrl) {
            const filename = `${targetSymbolLower}.png`; 
            const filepath = path.join(OUTPUT_DIR, filename);
            
            const success = await downloadImage(coin.logoUrl, filepath);
            if (success) {
                successCount++;
            } else {
                failCount++;
                console.warn(`Failed to download logo for ${coin.name} (${coin.symbol}).`);
            }
        } else {
            // This case should ideally not happen if scraper found a logoUrl
            failCount++;
            console.warn(`Could not retrieve logo URL for ${coin.name} (${coin.symbol}) from scraped data.`);
        }
    }

    console.log(`
----------------------------------------`);
    console.log(`Logo Download Complete.`);
    console.log(`Successfully downloaded: ${successCount}`);
    console.log(`Skipped (already exist): ${skippedCount}`); 
    console.log(`Failed to download:      ${failCount}`);
    console.log(`Total coins processed from scrape: ${scrapedCoins.length}`); // NEW: Info line
    console.log(`----------------------------------------`);

    if (failCount > 0) {
        console.warn('Some logos could not be downloaded. Check logs above for details.');
    }
}

main(); 