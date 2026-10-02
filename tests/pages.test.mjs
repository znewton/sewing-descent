import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { injectAriaCurrent } from "../src/pages.js";
import { readDirRecursive } from "../src/utils.js";

test("injectAriaCurrent marks only the matching nav link", () => {
	const html = '<nav><a href="/">Home</a><a href="/about.html">About</a></nav>';
	const result = injectAriaCurrent(html, "/about.html");
	assert.ok(result.includes('<a href="/about.html" aria-current="page">'));
	assert.ok(!result.includes('<a href="/" aria-current="page">'));
});

test("injectAriaCurrent is a no-op when no link matches the route", () => {
	const html = '<nav><a href="/journal.html">Journal</a></nav>';
	const result = injectAriaCurrent(html, "/about.html");
	assert.equal(result, html);
});

test("readDirRecursive walks nested directories without relying on Dirent.path", async () => {
	const entries = await readDirRecursive(
		path.join(process.cwd(), "site/pages"),
	);
	const names = entries.map((entry) => entry.name);
	assert.ok(names.includes("about.html"));
	assert.ok(names.includes("blog"));
	const waxEntry = entries.find(
		(entry) => entry.name === "wax-process-2024-04-06.md",
	);
	assert.ok(waxEntry, "expected nested blog post file to be found");
	assert.ok(
		waxEntry.absPath.endsWith(path.join("blog", "wax-process-2024-04-06.md")),
	);
});
