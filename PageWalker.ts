import * as puppeteer from "puppeteer";

namespace PageWalker {
    export interface PageWalkingHandler {
        (page: puppeteer.Page, walker: PageWalker): any;
    }

    export interface UrlFilter {
        (url: string): boolean;
    }
}

interface InternalPageWalkingHandler {
    (page: puppeteer.Page, walker: PageWalker): Promise<any>;
}

interface InternaUrlHandler {
    (url: string, page: puppeteer.Page, walker: PageWalker): Promise<any>;
}

interface InternalTargetHandler {
    (target: puppeteer.Target): Promise<boolean>
}

class PageWalker {
    private handlers: Array<InternaUrlHandler>;
    private initFunc: InternalPageWalkingHandler;
    private closeBrowserFunc: () => Promise<void>; 
    private prevUrl: string;
    private prevTime: number;

    constructor() {
        this.handlers = [];
    }

    private wrapHandler(handler: PageWalker.PageWalkingHandler): InternalPageWalkingHandler {
        return async (page: puppeteer.Page, self: PageWalker) => {
            const result = await handler(page, self);
            if (typeof result == "undefined") {
                return true;
            } else {
                return result;
            }
        };
    }

    initWith(handler: PageWalker.PageWalkingHandler): PageWalker {
        this.initFunc = this.wrapHandler(handler);
        return this;
    }

    andIf(urlOrCondition: string|PageWalker.UrlFilter, handler: PageWalker.PageWalkingHandler): PageWalker {
        if (typeof urlOrCondition == "string") {
            this.handlers.push(async (url: string, page: puppeteer.Page, self: PageWalker) => {
                if (url == urlOrCondition) {
                    return await this.wrapHandler(handler)(page, self);
                }
                return false;
            })
        } else if (typeof urlOrCondition == "function") {
            this.handlers.push(async (url: string, page: puppeteer.Page, self: PageWalker) => {
                if (urlOrCondition(url)) {
                    return await this.wrapHandler(handler)(page, self);
                }
                return false;
            })
        } else {
            throw new TypeError("urlOrCondition should be string or function");
        }
        return this;
    }

    async startWalking(puppeteerLaunchOptions: puppeteer.LaunchOptions) {
        const browser = await puppeteer.launch(puppeteerLaunchOptions);
        const asyncHandler = async (target: puppeteer.Target) => {
            await this.onDomReady((target: puppeteer.Target) => this.handleTargetAsync(target), target);
            return true;
        };
        browser.on("targetcreated", asyncHandler);
        browser.on("targetchanged", asyncHandler);

        // Since finish() can be called in init, closeBrowserFunc should be defined in advance.
        let closed = false;
        this.closeBrowserFunc = async () => {
            closed = true;
            await browser.close();
        };
        const initFuncPromise = this.initFunc(await browser.newPage(), this);

        if (!closed) {
            await new Promise<void>(
                (resolve: () => void, reject: (err: any) => void) => {
                    this.closeBrowserFunc = async () => {
                        await browser.close();
                        resolve();
                    }
                }
            );
        }

        try {
            await initFuncPromise;
        } catch (e) {
            // Most errors would be printed by UnhandledPromiseRejectionWarning.
            // so do not print any error here.
        }
        return this;
    }

    async finish(): Promise<void> {
        return await this.closeBrowserFunc();
    }

    async onDomReady(targetHandler: InternalTargetHandler, target: puppeteer.Target): Promise<boolean> {
        const page = await target.page();
        if (!page) {
            return false;
        }
        try {
            if (!(await this.isDomReady(page))) {
                await new Promise<void>((resolve: () => void, reject: (err: any) => void) => {
                    // @ts-ignore: domcontentloaded can be handled actually.
                    page.once("domcontentloaded", resolve);
                });
            }
            return await targetHandler(target);
        } catch (e) {
            if (this.isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }

    private async isDomReady(page: puppeteer.Page): Promise<boolean> {
        try {
            const readyState = await page.evaluate(() => document.readyState);
            return readyState == "interactive" || readyState == "complete";
        } catch (e) {
            if (this.isUnavoidableProtocolError(e)) {
                return false;
            }
            throw e;
        }
    }

    private isUnavoidableProtocolError(e: any): boolean {
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

    private async handleTargetAsync(target: puppeteer.Target): Promise<boolean> {
        const url = target.url();
        const page = await target.page();
        if (url && page) {
            return await this.handlePageAsync(url, page);
        }
        return false;
    }

    private async handlePageAsync(url: string, page: puppeteer.Page): Promise<boolean> {
        const curTime = new Date().getTime();
        if (this.prevUrl && this.prevUrl == url && curTime - this.prevTime < 1000) {
            return false;
        } else {
            this.prevUrl = url;
            this.prevTime = curTime;
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