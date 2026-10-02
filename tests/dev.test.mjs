import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FileServer } from "../src/dev.js";

async function fixture(t) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "sewing-dev-test-"));
	t.after(() => fs.rm(root, { recursive: true, force: true }));
	const server = new FileServer();
	server.STATIC_PATH = path.join(root, "dist");
	await fs.mkdir(server.STATIC_PATH);
	await fs.writeFile(path.join(server.STATIC_PATH, "index.html"), "Home");
	await fs.writeFile(path.join(server.STATIC_PATH, "404.html"), "Not found");
	return { server, root };
}

async function readStream(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks).toString();
}

test("dev server resolves the homepage independently of preview query parameters", async (t) => {
	const { server } = await fixture(t);
	const file = await server.prepareFile("/?theme=field-notes-nightfall");
	assert.equal(file.found, true);
	assert.equal(await readStream(file.stream), "Home");
});

test("dev server rejects traversal into a sibling with the same directory prefix", async (t) => {
	const { server, root } = await fixture(t);
	await fs.mkdir(path.join(root, "dist-private"));
	await fs.writeFile(path.join(root, "dist-private", "example.txt"), "Private");
	const file = await server.prepareFile("/%2e%2e%2fdist-private/example.txt");
	assert.equal(file.found, false);
	assert.equal(await readStream(file.stream), "Not found");
});

test("dev server logs malformed URL encoding and returns HTTP 400", async (t) => {
	const { server } = await fixture(t);
	const warning = t.mock.method(console, "warn", () => {});
	let status;
	let body;
	await server.handleHttpRequest(
		{ url: "/bad%ZZ" },
		{
			writeHead(code) {
				status = code;
			},
			end(text) {
				body = text;
			},
		},
	);
	assert.equal(status, 400);
	assert.equal(body, "Invalid request URL.");
	assert.equal(warning.mock.callCount(), 1);
});
