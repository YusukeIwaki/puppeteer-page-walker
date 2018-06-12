const puppeteer = require("puppeteer");

class PageWalker {
    constructor() {
        this._asyncHandlers = [];
    }

    _wrap(asyncHandler) {
        return async (page, self) => {
            const result = await asyncHandler(page, self);
            if (typeof result == "undefined") {
                return true
            } else {
                return result;
            }
        }
    }

    initWith(asyncHandler) {
        this._init = this._wrap(asyncHandler);
        return this;
    }

    andIf(urlOrCondition, asyncHandler) {
        if (typeof urlOrCondition == "string") {
            this._asyncHandlers.push(async (url, page, self) => {
                if (url == urlOrCondition) {
                    return await this._wrap(asyncHandler)(page, self);
                }
                return false;
            });
        } else if (typeof urlOrCondition == "function") {
            this._asyncHandlers.push(async (url, page, self) => {
                if (urlOrCondition(url)) {
                    return await this._wrap(asyncHandler)(page, self);
                }
                return false;
            })
        } else {
            throw new TypeError("urlOrCondition should be string or function");
        }
        return this;
    }

    async startWalking() {
        const browser = await puppeteer.launch();
        const asyncHandler = async (target) => {
            await this._onDomReady((target) => this._handleTargetAsync(target), target);
            return true;
        };
        browser.on("targetcreated", asyncHandler);
        browser.on("targetchanged", asyncHandler);

        // Since finish() can be called in init, _closedBrowser should be defined in advance.
        let closed = false;
        this._closeBrowser = async () => {
            closed = true;
            await browser.close();
        }
        await this._init(await browser.newPage(), this);

        if (!closed) {
            await new Promise((resolve, reject) => {
                this._closeBrowser = async () => {
                    await browser.close();
                }
            });
        }
        return this;
    }

    async finish() {
        await this._closeBrowser();
    }

    async _onDomReady(asyncHandler, target) {
        const page = await target.page();
        if (!page) {
            return false;
        }
        try {
            if (!(await this._isDomReady(page))) {
                await new Promise((resolve, reject) => {
                    page.once("domcontentloaded", resolve);
                });
            }
            return await asyncHandler(target);
        } catch (e) {
            if (this._isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }

    async _isDomReady(page) {
        try {
            const readyState = await page.evaluate(() => document.readyState);
            return readyState == "interactive" || readyState == "complete";
        } catch (e) {
            if (this._isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }

    _isUnavoidableProtocolError(e) {
        if (e instanceof Error) {
            if (e.message.match(/^Protocol error.*(Cannot find context with specified id undefined|Target closed)/)) {
                return true;
            }
        }
        return false;
    }

    async _handleTargetAsync(target) {
        const url = target.url();
        const page = await target.page();
        if (url && page) {
            return await this._handlePageAsync(url, page);
        }
        return false;
    }

    async _handlePageAsync(url, page) {
        const curTime = new Date() - 0;
        if (this._prevUrl && this._prevUrl == url && curTime - this._prevTime < 1000) {
            return false;
        } else {
            this._prevUrl = url;
            this._prevTime = curTime;
        }
        for (let i = 0; i < this._asyncHandlers.length; i++) {
            if (await this._asyncHandlers[i](url, page, this)) {
                return true;
            }
        }
        return false;
    }
}

module.exports = PageWalker;