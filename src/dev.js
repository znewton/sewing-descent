/**
 * Anything to do with dev mode.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import EventEmitter from "node:events";
import open from "open";
import { WebSocketServer } from "ws";
import { getOutputDir, getRootDir } from "./utils.js";

const DEV_PORT = 4567;

// Adapted from https://developer.mozilla.org/en-US/docs/Learn/Server-side/Node_server_without_framework
class FileServer {
    MIME_TYPES = {
        default: "application/octet-stream",
        html: "text/html; charset=UTF-8",
        js: "application/javascript",
        css: "text/css",
        png: "image/png",
        jpg: "image/jpg",
        gif: "image/gif",
        ico: "image/x-icon",
        svg: "image/svg+xml",
    };
    STATIC_PATH = getOutputDir();
    toBool = [() => true, () => false];
    prepareFile = async (url) => {
        const paths = [this.STATIC_PATH, url];
        if (url.endsWith("/")) paths.push("index.html");
        const filePath = path.join(...paths);
        const pathTraversal = !filePath.startsWith(this.STATIC_PATH);
        const exists = await fs.access(filePath).then(...this.toBool);
        const found = !pathTraversal && exists;
        const streamPath = found ? filePath : this.STATIC_PATH + "/404.html";
        const ext = path.extname(streamPath).substring(1).toLowerCase();
        const stream = fsSync.createReadStream(streamPath);
        return { found, ext, stream };
    };
    initSocketServer = (server) => {
        const distFileWatcher = new FileWatcher(getOutputDir());
        const websocketServer = new WebSocketServer({ server });

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
    };
    handleHttpRequest = async (req, res) => {
        const file = await this.prepareFile(req.url);
        const statusCode = file.found ? 200 : 404;
        const mimeType = this.MIME_TYPES[file.ext] || this.MIME_TYPES.default;
        res.writeHead(statusCode, { "Content-Type": mimeType });
        file.stream.pipe(res);
        console.log(`${req.method} ${req.url} ${statusCode}`);
    };
    start = () => {
        const server = http
            .createServer(this.handleHttpRequest.bind(this))
            .listen(DEV_PORT);
        this.initSocketServer(server);
    };
}

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
    console.log("Initializing Dev server...");
    const fileServer = new FileServer();
    fileServer.start();
    console.log(`Dev server listening on http://localhost:${DEV_PORT}`);
    open(`http://localhost:${DEV_PORT}`);
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
