"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require("puppeteer");
class PageWalker {
    constructor() {
        this.handlers = [];
    }
    wrapHandler(handler) {
        return async (page, self) => {
            const result = await handler(page, self);
            if (typeof result == "undefined") {
                return true;
            }
            else {
                return result;
            }
        };
    }
    initWith(handler) {
        this.initFunc = this.wrapHandler(handler);
        return this;
    }
    andIf(urlOrCondition, handler) {
        if (typeof urlOrCondition == "string") {
            this.handlers.push(async (url, page, self) => {
                if (url == urlOrCondition) {
                    return await this.wrapHandler(handler)(page, self);
                }
                return false;
            });
        }
        else if (typeof urlOrCondition == "function") {
            this.handlers.push(async (url, page, self) => {
                if (urlOrCondition(url)) {
                    return await this.wrapHandler(handler)(page, self);
                }
                return false;
            });
        }
        else {
            throw new TypeError("urlOrCondition should be string or function");
        }
        return this;
    }
    setRouter(router) {
        this.router = router;
        return this;
    }
    async startWalking(puppeteerLaunchOptions) {
        const browser = await puppeteer.launch(puppeteerLaunchOptions);
        const asyncHandler = async (target) => {
            await this.onDomReady((target) => this.handleTargetAsync(target), target);
            return true;
        };
        browser.on("targetcreated", asyncHandler);
        browser.on("targetchanged", asyncHandler);
        let closed = false;
        this.closeBrowserFunc = async () => {
            closed = true;
            await browser.close();
        };
        const initFuncPromise = this.initFunc(await browser.newPage(), this);
        if (!closed) {
            await new Promise((resolve, reject) => {
                this.closeBrowserFunc = async () => {
                    await browser.close();
                    resolve();
                };
            });
        }
        try {
            await initFuncPromise;
        }
        catch (e) {
        }
        return this;
    }
    async finish() {
        return await this.closeBrowserFunc();
    }
    async onDomReady(targetHandler, target) {
        const page = await target.page();
        if (!page) {
            return false;
        }
        try {
            if (!(await this.isDomReady(page))) {
                await new Promise((resolve, reject) => {
                    page.once("domcontentloaded", resolve);
                });
            }
            return await targetHandler(target);
        }
        catch (e) {
            if (this.isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }
    async isDomReady(page) {
        try {
            const readyState = await page.evaluate(() => document.readyState);
            return readyState == "interactive" || readyState == "complete";
        }
        catch (e) {
            if (this.isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }
    isUnavoidableProtocolError(e) {
        if (e instanceof Error) {
            if (e.message.match(/^Protocol error.*(Cannot find context with specified id undefined|Target closed)/)) {
                return true;
            }
            if (e.message == 'Execution context was destroyed, most likely because of a navigation.') {
                return true;
            }
        }
        return false;
    }
    async handleTargetAsync(target) {
        const url = target.url();
        const page = await target.page();
        if (url && page) {
            return await this.handlePageAsync(url, page);
        }
        return false;
    }
    async handlePageAsync(url, page) {
        const curTime = new Date().getTime();
        if (this.prevUrl && this.prevUrl == url && curTime - this.prevTime < 1000) {
            return false;
        }
        else {
            this.prevUrl = url;
            this.prevTime = curTime;
        }
        if (this.router != null) {
            return await this.router.handle(url, page, this);
        }
        for (let i = 0; i < this.handlers.length; i++) {
            if (await this.handlers[i](url, page, this)) {
                return true;
            }
        }
        return false;
    }
}
module.exports = PageWalker;
//# sourceMappingURL=PageWalker.js.map