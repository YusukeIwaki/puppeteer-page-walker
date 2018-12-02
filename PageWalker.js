"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer = require("puppeteer");
class PageWalker {
    constructor() {
        this.handlers = [];
    }
    wrapHandler(handler) {
        return (page, self) => __awaiter(this, void 0, void 0, function* () {
            const result = yield handler(page, self);
            if (typeof result == "undefined") {
                return true;
            }
            else {
                return result;
            }
        });
    }
    initWith(handler) {
        this.initFunc = this.wrapHandler(handler);
        return this;
    }
    andIf(urlOrCondition, handler) {
        if (typeof urlOrCondition == "string") {
            this.handlers.push((url, page, self) => __awaiter(this, void 0, void 0, function* () {
                if (url == urlOrCondition) {
                    return yield this.wrapHandler(handler)(page, self);
                }
                return false;
            }));
        }
        else if (typeof urlOrCondition == "function") {
            this.handlers.push((url, page, self) => __awaiter(this, void 0, void 0, function* () {
                if (urlOrCondition(url)) {
                    return yield this.wrapHandler(handler)(page, self);
                }
                return false;
            }));
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
    startWalking(puppeteerLaunchOptions) {
        return __awaiter(this, void 0, void 0, function* () {
            const browser = yield puppeteer.launch(puppeteerLaunchOptions);
            const asyncHandler = (target) => __awaiter(this, void 0, void 0, function* () {
                yield this.onDomReady((target) => this.handleTargetAsync(target), target);
                return true;
            });
            browser.on("targetcreated", asyncHandler);
            browser.on("targetchanged", asyncHandler);
            let closed = false;
            this.closeBrowserFunc = () => __awaiter(this, void 0, void 0, function* () {
                closed = true;
                yield browser.close();
            });
            const initFuncPromise = this.initFunc(yield browser.newPage(), this);
            if (!closed) {
                yield new Promise((resolve, reject) => {
                    this.closeBrowserFunc = () => __awaiter(this, void 0, void 0, function* () {
                        yield browser.close();
                        resolve();
                    });
                });
            }
            try {
                yield initFuncPromise;
            }
            catch (e) {
            }
            return this;
        });
    }
    finish() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.closeBrowserFunc();
        });
    }
    onDomReady(targetHandler, target) {
        return __awaiter(this, void 0, void 0, function* () {
            const page = yield target.page();
            if (!page) {
                return false;
            }
            try {
                if (!(yield this.isDomReady(page))) {
                    yield new Promise((resolve, reject) => {
                        page.once("domcontentloaded", resolve);
                    });
                }
                return yield targetHandler(target);
            }
            catch (e) {
                if (this.isUnavoidableProtocolError(e)) {
                    return false;
                }
                throw e;
            }
        });
    }
    isDomReady(page) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const readyState = yield page.evaluate(() => document.readyState);
                return readyState == "interactive" || readyState == "complete";
            }
            catch (e) {
                if (this.isUnavoidableProtocolError(e)) {
                    return false;
                }
                throw e;
            }
        });
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
    handleTargetAsync(target) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = target.url();
            const page = yield target.page();
            if (url && page) {
                return yield this.handlePageAsync(url, page);
            }
            return false;
        });
    }
    handlePageAsync(url, page) {
        return __awaiter(this, void 0, void 0, function* () {
            const curTime = new Date().getTime();
            if (this.prevUrl && this.prevUrl == url && curTime - this.prevTime < 1000) {
                return false;
            }
            else {
                this.prevUrl = url;
                this.prevTime = curTime;
            }
            if (this.router != null) {
                return yield this.router.handle(url, page, this);
            }
            for (let i = 0; i < this.handlers.length; i++) {
                if (yield this.handlers[i](url, page, this)) {
                    return true;
                }
            }
            return false;
        });
    }
}
module.exports = PageWalker;
//# sourceMappingURL=PageWalker.js.map