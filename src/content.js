/**
 * Agent-editable Markdown + metadata content system for Journal posts.
 *
 * Each post lives at `site/content/posts/<slug>/post.json` + `body.md`.
 * This module loads, strictly validates, and renders those posts into
 * the Journal listing and individual article pages. Invalid metadata
 * fails the build with an actionable, file-scoped error instead of a
 * silent fallback.
 */

import fs from "node:fs/promises";
import path from "node:path";
import showdown from "showdown";
import { exists, getRootDir } from "./utils.js";

const VALID_TYPES = ["project", "technique"];
const VALID_STATUSES = ["draft", "published"];
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TAG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_ALT_LENGTH = 10;
const ALLOWED_IMAGE_EXTENSIONS = [
	".webp",
	".jpg",
	".jpeg",
	".png",
	".gif",
	".svg",
];
const MARKDOWN_IMAGE_PATTERN =
	/!\[([^\]]*)\]\(\s*(\S+?)(?:\s+"([^"]*)")?\s*\)/g;

/**
 * Check whether a string is a meaningful alt/caption description rather
 * than empty or a bare filename (e.g. "IMG_0421.jpg").
 * @param {unknown} value
 * @returns {boolean}
 */
function isMeaningfulDescription(value) {
	if (typeof value !== "string") return false;
	const trimmed = value.trim();
	if (trimmed.length < MIN_ALT_LENGTH) return false;
	return !/\.(webp|jpe?g|png|gif|svg)$/i.test(trimmed);
}

/**
 * Validate that an ISO `YYYY-MM-DD` string is a real calendar date, not
 * just a value `Date.parse` silently rolls over (e.g. the JS engine
 * accepts "2024-02-30" and rolls it forward to "2024-03-01" instead of
 * rejecting it). Round-trips the parsed components back to the original
 * string to catch that case.
 * @param {string} isoDate
 * @returns {boolean}
 */
export function isValidIsoDate(isoDate) {
	if (typeof isoDate !== "string" || !DATE_PATTERN.test(isoDate)) {
		return false;
	}
	const [year, month, day] = isoDate.split("-").map(Number);
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

/**
 * Resolve a required public asset path (as used in `cover.src` or a
 * Markdown body image) to an absolute filesystem path, requiring it to:
 * - be a string starting with "/static/" (the only publicly servable
 *   root; anything else either 404s in production or was never copied
 *   into `dist/` from a post-local relative path)
 * - stay contained within the `static/` directory after normalizing
 *   `..` segments and percent-decoding, so `/static/../../secret` or
 *   `/static/%2e%2e/%2e%2e/secret` cannot escape it
 * - use an allowed image extension
 * @param {unknown} srcValue
 * @returns {{ absPath: string } | { error: string }} resolved path or a reason it was rejected
 */
function resolvePublicImagePath(srcValue) {
	if (typeof srcValue !== "string" || srcValue.trim().length === 0) {
		return { error: "must be a non-empty string" };
	}
	let decoded;
	try {
		decoded = decodeURIComponent(srcValue);
	} catch {
		return { error: "is not validly URL-encoded" };
	}
	if (!decoded.startsWith("/static/")) {
		return {
			error:
				'must start with "/static/" (the only directory copied into the published site; post-local relative paths are never published)',
		};
	}
	const ext = path.extname(decoded).toLowerCase();
	if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
		return {
			error: `must use an allowed image extension (${ALLOWED_IMAGE_EXTENSIONS.join(
				", ",
			)})`,
		};
	}
	const staticRoot = path.join(getRootDir(), "static");
	const relFromStatic = decoded.replace(/^\/static\//, "");
	const absPath = path.normalize(path.join(staticRoot, relFromStatic));
	const normalizedRoot = path.normalize(staticRoot + path.sep);
	if (
		!(absPath + path.sep).startsWith(normalizedRoot) &&
		absPath !== staticRoot
	) {
		return {
			error: "must stay inside the static/ directory (no path traversal)",
		};
	}
	return { absPath };
}

/**
 * Validate Markdown image references in an owner-authored post body.
 * The body itself is trusted prose, but its images are still real
 * published assets, so each one must point at a local file under
 * `static/` and carry a meaningful alt description, same as `cover`.
 * @param {string} slug
 * @param {string} bodyMarkdown
 * @returns {Promise<string[]>} validation errors (empty if all images are valid)
 */
async function validateBodyImages(slug, bodyMarkdown) {
	const errors = [];
	const prefix = `site/content/posts/${slug}/body.md`;
	const matches = [...bodyMarkdown.matchAll(MARKDOWN_IMAGE_PATTERN)];
	for (const match of matches) {
		const [, alt, src, caption] = match;
		if (!isMeaningfulDescription(alt)) {
			errors.push(
				`${prefix}: image "${src}" needs a meaningful alt description (at least ${MIN_ALT_LENGTH} characters, not a filename); got "${alt}".`,
			);
		}
		const resolved = resolvePublicImagePath(src);
		if ("error" in resolved) {
			errors.push(`${prefix}: image src "${src}" ${resolved.error}.`);
		} else if (!(await exists(resolved.absPath, "file"))) {
			errors.push(
				`${prefix}: image src "${src}" points to a file that does not exist locally.`,
			);
		}
		if (caption !== undefined && caption.trim().length === 0) {
			errors.push(
				`${prefix}: image "${src}" has an empty caption/title in parentheses; omit it or add real text.`,
			);
		}
	}
	return errors;
}

/**
 * @returns {string} absolute path to the content posts directory.
 */
export function getPostsDir() {
	return path.join(getRootDir(), "site/content/posts");
}

/**
 * Escape a string for safe inclusion in HTML text or attribute content.
 * @param {unknown} value - value to escape; coerced to string first.
 * @returns {string} escaped string
 */
export function escapeHtml(value) {
	return String(value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Format an ISO `YYYY-MM-DD` date string for display.
 * @param {string} isoDate - date in YYYY-MM-DD form
 * @returns {string} human readable date, e.g. "April 6, 2024"
 */
export function formatDate(isoDate) {
	const [year, month, day] = isoDate.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});
}

/**
 * @typedef PostValidationError
 * @property {string} slug
 * @property {string} message
 */

/**
 * Validate a single post's metadata. Throws with an actionable message
 * referencing the offending slug/field on the first failure so build
 * errors are easy to locate and fix.
 * @param {string} slug - folder/slug name of the post
 * @param {Record<string, unknown>} meta - parsed post.json contents
 * @param {string} postDir - absolute directory of the post, for asset checks
 * @returns {Promise<string[]>} list of human-readable validation errors (empty if valid)
 */
export async function validatePostMeta(slug, meta, postDir) {
	const errors = [];
	const prefix = `site/content/posts/${slug}/post.json`;

	if (!SLUG_PATTERN.test(slug)) {
		errors.push(
			`${prefix}: folder name "${slug}" must be lowercase kebab-case (e.g. "waxed-canvas-pack").`,
		);
	}

	if (typeof meta !== "object" || meta === null) {
		errors.push(`${prefix}: metadata must be a JSON object.`);
		return errors;
	}

	for (const field of ["title", "date", "summary", "type", "tags"]) {
		if (meta[field] === undefined || meta[field] === null) {
			errors.push(`${prefix}: missing required field "${field}".`);
		}
	}

	if (meta.title !== undefined && typeof meta.title !== "string") {
		errors.push(`${prefix}: "title" must be a string.`);
	} else if (typeof meta.title === "string" && meta.title.trim().length === 0) {
		errors.push(`${prefix}: "title" must not be empty.`);
	}
	if (meta.summary !== undefined && typeof meta.summary !== "string") {
		errors.push(`${prefix}: "summary" must be a string.`);
	} else if (
		typeof meta.summary === "string" &&
		meta.summary.trim().length === 0
	) {
		errors.push(`${prefix}: "summary" must not be empty.`);
	}

	if (meta.date !== undefined) {
		if (typeof meta.date !== "string" || !DATE_PATTERN.test(meta.date)) {
			errors.push(`${prefix}: "date" must be formatted as YYYY-MM-DD.`);
		} else if (!isValidIsoDate(meta.date)) {
			errors.push(
				`${prefix}: "date" value "${meta.date}" is not a real calendar date (e.g. a day that doesn't exist in that month).`,
			);
		}
	}

	if (meta.type !== undefined && !VALID_TYPES.includes(meta.type)) {
		errors.push(
			`${prefix}: "type" must be one of ${VALID_TYPES.join(", ")}, got "${
				meta.type
			}".`,
		);
	}

	if (meta.status !== undefined && !VALID_STATUSES.includes(meta.status)) {
		errors.push(
			`${prefix}: "status" must be one of ${VALID_STATUSES.join(
				", ",
			)} when provided, got "${meta.status}".`,
		);
	}

	if (
		meta.layoutExample !== undefined &&
		typeof meta.layoutExample !== "boolean"
	) {
		errors.push(`${prefix}: "layoutExample" must be a boolean when provided.`);
	}
	if (meta.layoutExample === true && meta.status === "published") {
		errors.push(
			`${prefix}: a "layoutExample" post must never be published; set "status" back to "draft" or remove "layoutExample".`,
		);
	}

	if (meta.tags !== undefined) {
		if (!Array.isArray(meta.tags) || meta.tags.length === 0) {
			errors.push(`${prefix}: "tags" must be a non-empty array of strings.`);
		} else {
			const seen = new Set();
			for (const tag of meta.tags) {
				if (typeof tag !== "string" || !TAG_PATTERN.test(tag)) {
					errors.push(
						`${prefix}: tag "${tag}" must be lowercase kebab-case (e.g. "waxed-canvas").`,
					);
					continue;
				}
				if (seen.has(tag)) {
					errors.push(`${prefix}: duplicate tag "${tag}" in "tags".`);
				}
				seen.add(tag);
			}
		}
	}

	if (meta.cover !== undefined) {
		const cover = meta.cover;
		if (typeof cover !== "object" || cover === null || Array.isArray(cover)) {
			errors.push(`${prefix}: "cover" must be an object when provided.`);
		} else {
			for (const field of ["src", "alt", "width", "height"]) {
				if (cover[field] === undefined || cover[field] === null) {
					errors.push(
						`${prefix}: "cover.${field}" is required when "cover" is set.`,
					);
				}
			}
			if (cover.alt !== undefined) {
				if (typeof cover.alt !== "string") {
					errors.push(`${prefix}: "cover.alt" must be a string.`);
				} else if (!isMeaningfulDescription(cover.alt)) {
					errors.push(
						`${prefix}: "cover.alt" must be a meaningful description (at least ${MIN_ALT_LENGTH} characters, not a filename).`,
					);
				}
			}
			if (cover.caption !== undefined && typeof cover.caption !== "string") {
				errors.push(
					`${prefix}: "cover.caption" must be a string when provided.`,
				);
			}
			for (const dim of ["width", "height"]) {
				if (
					cover[dim] !== undefined &&
					!(
						typeof cover[dim] === "number" &&
						Number.isInteger(cover[dim]) &&
						cover[dim] > 0
					)
				) {
					errors.push(`${prefix}: "cover.${dim}" must be a positive integer.`);
				}
			}
			if (cover.src !== undefined) {
				const resolved = resolvePublicImagePath(cover.src);
				if ("error" in resolved) {
					errors.push(`${prefix}: "cover.src" ${resolved.error}.`);
				} else if (!(await exists(resolved.absPath, "file"))) {
					errors.push(
						`${prefix}: "cover.src" points to a file that does not exist locally (${cover.src}).`,
					);
				}
			}
		}
	}

	const bodyPath = path.join(postDir, "body.md");
	if (!(await exists(bodyPath, "file"))) {
		errors.push(
			`site/content/posts/${slug}/body.md: required body file is missing.`,
		);
	} else {
		const bodyMarkdown = (await fs.readFile(bodyPath)).toString();
		if (bodyMarkdown.trim().length === 0) {
			errors.push(
				`site/content/posts/${slug}/body.md: body must not be silently empty; write at least a short placeholder for drafts, or the finished text for published posts.`,
			);
		} else {
			errors.push(...(await validateBodyImages(slug, bodyMarkdown)));
		}
	}

	return errors;
}

/**
 * @typedef LoadedPost
 * @property {string} slug
 * @property {Record<string, unknown>} meta
 * @property {string} bodyMarkdown
 * @property {string} route - absolute site route, e.g. "/journal/example.html"
 */

/**
 * Load, validate, and parse every post under `site/content/posts`.
 * Throws a single aggregated error (nonzero build) if any post is invalid.
 * @returns {Promise<LoadedPost[]>}
 */
export async function loadPosts() {
	const postsDir = getPostsDir();
	if (!(await exists(postsDir, "directory"))) {
		return [];
	}
	const entries = await fs.readdir(postsDir, { withFileTypes: true });
	const slugDirs = entries.filter((entry) => entry.isDirectory());

	/** @type {string[]} */
	const allErrors = [];
	/** @type {LoadedPost[]} */
	const posts = [];
	const seenSlugs = new Set();

	for (const entry of slugDirs) {
		const slug = entry.name;
		const postDir = path.join(postsDir, slug);
		const jsonPath = path.join(postDir, "post.json");

		if (seenSlugs.has(slug.toLowerCase())) {
			allErrors.push(
				`site/content/posts/${slug}: duplicate slug (case-insensitive).`,
			);
			continue;
		}
		seenSlugs.add(slug.toLowerCase());

		if (!(await exists(jsonPath, "file"))) {
			allErrors.push(`site/content/posts/${slug}/post.json: file is missing.`);
			continue;
		}

		/** @type {Record<string, unknown>} */
		let meta;
		try {
			meta = JSON.parse((await fs.readFile(jsonPath)).toString());
		} catch (error) {
			allErrors.push(
				`site/content/posts/${slug}/post.json: invalid JSON (${error.message}).`,
			);
			continue;
		}

		const errors = await validatePostMeta(slug, meta, postDir);
		if (errors.length > 0) {
			allErrors.push(...errors);
			continue;
		}

		const bodyMarkdown = (
			await fs.readFile(path.join(postDir, "body.md"))
		).toString();

		posts.push({
			slug,
			meta: {
				status: "draft",
				...meta,
			},
			bodyMarkdown,
			route: `/journal/${slug}.html`,
		});
	}

	if (allErrors.length > 0) {
		throw new Error(
			`Content validation failed with ${
				allErrors.length
			} error(s):\n- ${allErrors.join("\n- ")}`,
		);
	}

	posts.sort((a, b) => {
		// Layout-example posts always sort after real entries regardless
		// of their literal date value, so a future placeholder date never
		// pushes demo content above genuinely recent work in previews
		// (production never shows them at all; see buildJournalPages).
		if (!!a.meta.layoutExample !== !!b.meta.layoutExample) {
			return a.meta.layoutExample ? 1 : -1;
		}
		return a.meta.date < b.meta.date ? 1 : -1;
	});
	return posts;
}

/**
 * Render the date/label portion of a post's meta line. Layout-example
 * (demo) posts never show a real date, even though one is required in
 * metadata for stable sorting, because a convincing-looking date on
 * placeholder content could be mistaken for a real, dated entry.
 * @param {Record<string, unknown>} meta
 * @returns {string}
 */
function renderDateOrLabel(meta) {
	if (meta.layoutExample) {
		return '<span class="layout-example-label">Layout example</span>';
	}
	return `<time datetime="${escapeHtml(meta.date)}">${escapeHtml(
		formatDate(meta.date),
	)}</time>`;
}

/**
 * Render a post's Markdown body to HTML. The body itself is trusted,
 * owner-authored Markdown; only metadata needs explicit HTML escaping
 * since it is interpolated directly into surrounding template strings.
 * @param {string} markdown
 * @returns {string}
 */
export function renderBodyHtml(markdown) {
	return new showdown.Converter().makeHtml(markdown);
}

/**
 * Build the <article> HTML for a single post using the shared article
 * template structure (title, dek, date, tags, optional cover, body).
 * @param {LoadedPost} post
 * @returns {string}
 */
export function renderArticleHtml(post) {
	const { meta } = post;
	const isDraft = meta.status !== "published";
	const tagsHtml = meta.tags
		.map((tag) => `<li>${escapeHtml(tag)}</li>`)
		.join("");
	const coverHtml = meta.cover
		? `<figure class="article-cover">
                <img src="${escapeHtml(meta.cover.src)}" alt="${escapeHtml(
									meta.cover.alt,
								)}" width="${Number(meta.cover.width)}" height="${Number(
									meta.cover.height,
								)}" loading="lazy" />
                ${
									meta.cover.caption
										? `<figcaption>${escapeHtml(
												meta.cover.caption,
											)}</figcaption>`
										: ""
								}
            </figure>`
		: "";
	return `<main class="flex-center-column">
        <section class="flex-column flex-start prose">
            <p><a href="/journal.html">&larr; Back to Journal</a></p>
            <header class="article-header">
                <p class="article-meta">
                    <span>${escapeHtml(
											meta.type === "project" ? "Project" : "Technique",
										)}</span>
                    <span>&middot;</span>
                    ${renderDateOrLabel(meta)}
                    ${isDraft ? '<span class="draft-badge">Draft</span>' : ""}
                </p>
                <h1>${escapeHtml(meta.title)}</h1>
                <p class="article-dek">${escapeHtml(meta.summary)}</p>
                <ul class="journal-card-tags">${tagsHtml}</ul>
            </header>
            ${coverHtml}
            <div class="article-body">${renderBodyHtml(post.bodyMarkdown)}</div>
        </section>
    </main>`;
}

/**
 * Build a single Journal listing card for a post (always visible; tag
 * filtering is a progressive enhancement over this server-rendered markup).
 * @param {LoadedPost} post
 * @returns {string}
 */
export function renderJournalCard(post) {
	const { meta } = post;
	const isDraft = meta.status !== "published";
	const tagsHtml = meta.tags
		.map((tag) => `<li>${escapeHtml(tag)}</li>`)
		.join("");
	return `<li class="journal-card" data-tags="${meta.tags
		.map(escapeHtml)
		.join(" ")}">
        ${isDraft ? '<span class="draft-badge">Draft</span>' : ""}
        <p class="journal-card-meta">${escapeHtml(
					meta.type === "project" ? "Project" : "Technique",
				)} &middot; ${renderDateOrLabel(meta)}</p>
        <h3><a href="${post.route}">${escapeHtml(meta.title)}</a></h3>
        <p>${escapeHtml(meta.summary)}</p>
        <ul class="journal-card-tags">${tagsHtml}</ul>
    </li>`;
}
