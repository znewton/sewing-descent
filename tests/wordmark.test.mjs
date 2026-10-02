import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { ensureWordmarkFont, readWordmarkArchive } from "../src/wordmark.js";

test("wordmark archive requires both the font and its license", () => {
	assert.throws(
		() =>
			readWordmarkArchive(
				zipSync({ "readme.txt": strToU8("free for personal use.") }),
			),
		/missing.*font or license/,
	);
});

test("wordmark archive rejects changed font bytes before installing them", () => {
	assert.throws(
		() =>
			readWordmarkArchive(
				zipSync({
					"Punkboy 2.0.otf": strToU8("unreviewed font"),
					"readme.txt": strToU8("free for personal use."),
				}),
			),
		/does not match the reviewed version/,
	);
});

test("wordmark archive rejects oversized downloads", () => {
	assert.throws(
		() => readWordmarkArchive(new Uint8Array(1024 * 1024 + 1)),
		/download limit/,
	);
});

test("wordmark cache rejects corruption instead of silently substituting a font", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "sewing-wordmark-"));
	try {
		await fs.mkdir(path.join(root, "static"));
		await fs.writeFile(
			path.join(root, "static", "punkboy.otf"),
			"not the reviewed font",
		);
		await assert.rejects(
			ensureWordmarkFont(root),
			/does not match the reviewed version/,
		);
	} finally {
		await fs.rm(root, { recursive: true });
	}
});
