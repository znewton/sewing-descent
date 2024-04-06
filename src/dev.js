/**
 * Anything to do with dev mode.
 */

import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import EventEmitter from "node:events";
import { randomUUID } from "node:crypto";
import open from "open";
import { WebSocket, WebSocketServer } from "ws";
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
    /**
     * @type {Record<string, WebSocket>}
     */
    connections = {};
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
        const websocketServer = new WebSocketServer({ server });

        websocketServer.on("connection", (ws) => {
            const connectionId = randomUUID();
            this.connections[connectionId] = ws;
            ws.on("close", () => {
                delete this.connections[connectionId];
            });
        });
        process.on("exit", () => {
            console.log("Killing hot reload server");
            websocketServer.close();
        });
    };
    reload = () => {
        for (const ws of Object.values(this.connections)) {
            ws.send("reload");
        }
    };
    handleHttpRequest = async (req, res) => {
        const file = await this.prepareFile(req.url);
        const statusCode = file.found ? 200 : 404;
        const mimeType = this.MIME_TYPES[file.ext] || this.MIME_TYPES.default;
        res.writeHead(statusCode, { "Content-Type": mimeType });
        file.stream.pipe(res);
        console.log(`${req.method} ${req.url} ${statusCode}`);
    };
    /**
     *
     * @param {number} port - port for the server to listen on
     * @returns {Promise<FileServer>} - the file server instance
     */
    start = (port) => {
        return new Promise((resolve, reject) => {
            const server = http
                .createServer(this.handleHttpRequest.bind(this))
                .listen(port, (err) => {
                    if (err) {
                        return reject(err);
                    }
                    this.initSocketServer(server);
                    open(`http://localhost:${port}`);
                    resolve(this);
                });
        });
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
                    if (buffered === false) {
                        buffered = true;
                        setTimeout(() => {
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
 * Compile the site and recompile whenever source files change.
 * @param {() => Promise<void>} compileFn - Function that compiles the site when called.
 */
export async function initDev(compileFn) {
    console.log("Initializing Watch and Compile...");
    const rootDir = getRootDir();
    const siteFileWatcher = new FileWatcher(path.join(rootDir, "site"));
    const fileServer = new FileServer();
    await fileServer.start(DEV_PORT).then(() => {
        console.log(`Dev server listening on http://localhost:${DEV_PORT}`);
    });
    siteFileWatcher.on("change", () => {
        console.log("File change detected.");
        console.clear();
        console.log("Recompiling...");
        compileFn()
            .then(() => {
                console.log("Recompiled. Reloading...");
                fileServer.reload();
            })
            .catch(console.error);
    });
}
