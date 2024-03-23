/**
 * Anything to do with dev mode.
 */

import fs from "node:fs/promises";
import path from "node:path";
import EventEmitter from "node:events";
import { WebSocketServer } from "ws";
import { getOutputDir, getRootDir } from "./utils.js";

class FileWatcher extends EventEmitter {
    /**
     * @type {boolean}
     */
    initialized = false;
    /**
     * @type {string}
     */
    directory;
    /**
     * @type {AbortController}
     */
    ac = new AbortController();

    /**
     * @param {string} directory - file directory to watch for changes
     */
    constructor(directory) {
        super();
        this.directory = directory;
        process.on("exit", () => {
            console.log("Killing file watcher");
            this.ac.abort();
        });
        this.init();
    }
    init() {
        if (this.initialized === true) {
            return;
        }
        const { signal } = this.ac;

        (async () => {
            try {
                const watcher = fs.watch(this.directory, {
                    signal,
                    recursive: true,
                });
                let buffered = false;
                for await (const event of watcher) {
                    console.log("Files changed", event);
                    if (buffered === false) {
                        buffered = true;
                        setTimeout(() => {
                            console.log("Files changed", event);
                            this.emit("change", event);
                            setTimeout(() => {
                                buffered = false;
                            }, 300);
                        }, 300);
                    }
                }
            } catch (err) {
                if (err.name === "AbortError") return;
                throw err;
            }
        })();
        this.initialized = true;
    }
}

/**
 * Initialize hot reload dev server.
 * @returns {Promise<void>} callback to shutdown the server.
 */
export async function initDevServer() {
    const distFileWatcher = new FileWatcher(getOutputDir());
    console.log("Initializing Dev reload server...");
    const websocketServer = new WebSocketServer({ port: 4567 });

    websocketServer.on("connection", function connection(ws) {
        const fileChangeListener = () => {
            ws.send("reload");
        };
        ws.on("close", () => {
            distFileWatcher.off("change", fileChangeListener);
        });
        distFileWatcher.on("change", fileChangeListener);
    });
    process.on("exit", () => {
        console.log("Killing hot reload server");
        websocketServer.close();
    });
}

/**
 * Compile the site and recompile whenever source files change.
 * @param {() => Promise<void>} compileFn - Function that compiles the site when called.
 */
export async function initWatchAndCompile(compileFn) {
    const rootDir = getRootDir();
    const siteFileWatcher = new FileWatcher(path.join(rootDir, "site"));
    console.log("Initializing Watch and Compile...");
    siteFileWatcher.on("change", () => {
        compileFn().catch(console.error);
    });
}
