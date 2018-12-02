# puppeteer-page-walker

A wrapper library of [puppeteer](https://github.com/GoogleChrome/puppeteer) for humane scraping :)

## Install

```
npm install puppeteer-page-walker
```

## Enjoy


```js
const PageWalker = require("puppeteer-page-walker");

new PageWalker()
    .initWith(async (page, walker) => {
        await page.setViewport({width:1200, height:480})
        await page.goto("https://github.com/", {"waitUntil": "domcontentloaded"});
    })
    .andIf(url => true, (page) => {
        console.log(">", page.url());
        return false;
    })
    .andIf("https://github.com/", async (page) => {
        const form = await page.$("form.js-site-search-form");
        const searchInput = await form.$("input.header-search-input");
        await searchInput.type("puppeteer");
        await searchInput.press("Enter");
    })
    .andIf(url => url.startsWith("https://github.com/search"), async (page, walker) => {
        const list = await page.$("ul.repo-list");
        const items = await list.$$("h3");
        await Promise.all(items.map(async item => {
            const title = await item.$eval("a", a => a.innerText)
            console.log("==>", title);
        }));

        await walker.finish();
    })
    .startWalking();
```

<details>
<summary>with 'nano_router.js'</summary>

```js
const PageWalker = require("puppeteer-page-walker");
const Router = require("nano_router.js");

let router = new Router()
router.on("https://github.com/", async (page) => {
    console.log(">", page.url());
    const form = await page.$("form.js-site-search-form");
    const searchInput = await form.$("input.header-search-input");
    await searchInput.type("puppeteer");
    await searchInput.press("Enter");
}).on(url => url.startsWith("https://github.com/search"), async (page, walker) => {
    console.log(">", page.url());
    const list = await page.$("ul.repo-list");
    const items = await list.$$("h3");
    await Promise.all(items.map(async item => {
        const title = await item.$eval("a", a => a.innerText)
        console.log("==>", title);
    }));

    await walker.finish();
}).onNoMatch((page) => {
    console.log(">", page.url());
});

new PageWalker()
    .initWith(async (page, walker) => {
        await page.setViewport({width:1200, height:480})
        await page.goto("https://github.com/", {"waitUntil": "domcontentloaded"});
    })
    .setRouter(router)
    .startWalking();
```

</details>
