import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { getRootDir } from "./utils.js";

const FONT_URL = "https://dl.dafont.com/dl/?f=punkboy";
const FONT_NAME = "Punkboy 2.0.otf";
const FONT_HASH =
	"89296406ad9b34bcb1481737cc6f094d3ddf4d3044b84d93ea572b096b3aaa3d";

function verifyFont(bytes) {
	if (createHash("sha256").update(bytes).digest("hex") !== FONT_HASH) {
		throw new Error(
			"Punkboy font does not match the reviewed version. Check the font source and license before updating its SHA-256.",
		);
	}
}

export function readWordmarkArchive(bytes) {
	if (bytes.length > 1024 * 1024) {
		throw new Error("Punkboy archive exceeds the 1 MB download limit.");
	}
	const files = unzipSync(bytes, {
		filter: (file) =>
			(file.name === FONT_NAME && file.originalSize <= 65536) ||
			(file.name === "readme.txt" && file.originalSize <= 4096),
	});
	const font = files[FONT_NAME];
	const license = files["readme.txt"];
	if (!font || !license) {
		throw new Error("Punkboy archive is missing the reviewed font or license.");
	}
	verifyFont(font);
	const licenseText = new TextDecoder().decode(license);
	if (!licenseText.includes("free for personal use.")) {
		throw new Error(
			"Punkboy license changed; review it before using the font.",
		);
	}
	return { font, licenseText };
}

export async function ensureWordmarkFont(rootDir = getRootDir()) {
	const fontPath = path.join(rootDir, "static", "punkboy.otf");
	try {
		verifyFont(await fs.readFile(fontPath));
		await fs.access(path.join(rootDir, "static", "punkboy-license.txt"));
		return;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	console.log("Downloading the personal-use Punkboy wordmark font...");
	const response = await fetch(FONT_URL, {
		signal: AbortSignal.timeout(30000),
	});
	if (!response.ok) {
		throw new Error(`Cannot download Punkboy font: HTTP ${response.status}.`);
	}
	const { font, licenseText } = readWordmarkArchive(
		new Uint8Array(await response.arrayBuffer()),
	);
	await fs.mkdir(path.dirname(fontPath), { recursive: true });
	await fs.writeFile(
		path.join(rootDir, "static", "punkboy-license.txt"),
		licenseText,
	);
	await fs.writeFile(fontPath, font);
}
