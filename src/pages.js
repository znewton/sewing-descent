/**
 * Build steps related to pages: static site/pages/** HTML & Markdown,
 * the agent-editable Journal content system, and (preview builds only)
 * the directions comparison hub.
 */

import fs from "node:fs/promises";
import path from "node:path";
import showdown from "showdown";
import {
	escapeHtml,
	loadPosts,
	renderArticleHtml,
	renderJournalCard,
} from "./content.js";
import { exists, getOutputDir, getRootDir, readDirRecursive } from "./utils.js";

/**
 * Page-specific stylesheets beyond the shared `index.css`, keyed by the
 * source page's filename (without extension). Linked in `<head>` so the
 * page's layout styles are available before first paint instead of being
 * discovered mid-body.
 * @type {Record<string, string[]>}
 */
const PAGE_STYLES = {
	index: ["home"],
};

/**
 * @typedef PagesOptions
 * @property {boolean} hotReload - whether to output with hot reload scripts.
 * @property {boolean} preview - whether to build in preview mode (theme
 *   toolbar, directions hub, and draft/demo content included).
 */

const THEME_TOOLBAR_HTML = `<div class="preview-toolbar" role="toolbar" aria-label="Design direction preview">
    <span class="preview-toolbar-label">Preview:</span>
    <button type="button" data-theme-option="field-notes" aria-pressed="false">Field Notes</button>
    <button type="button" data-theme-option="workshop" aria-pressed="false">Workshop</button>
    <button type="button" data-theme-option="nightfall" aria-pressed="false">Nightfall</button>
    <button type="button" data-theme-option="field-notes-nightfall" aria-pressed="true">Field Notes + Nightfall</button>
    <a href="/directions.html">Compare directions</a>
</div>
<script src="/scripts/theme.js" defer></script>`;

const THEME_INIT_SCRIPT = `<script>
(function () {
    try {
        var valid = ["field-notes", "workshop", "nightfall", "field-notes-nightfall"];
        var params = new URLSearchParams(window.location.search);
        var fromQuery = params.get("theme");
        var stored = null;
        try {
            stored = window.localStorage.getItem("sd-theme");
        } catch (e) {}
        var theme = valid.indexOf(fromQuery) !== -1 ? fromQuery :
            valid.indexOf(stored) !== -1 ? stored : "field-notes-nightfall";
        document.documentElement.setAttribute("data-theme", theme);
    } catch (e) {}
})();
</script>`;

const PREVIEW_STYLES_HTML = `<link rel="stylesheet" href="/styles/themes.css" />`;

/**
 * Build the base page template file string with mode-specific placeholders
 * (hot reload, preview theme toolbar/init script/styles) resolved.
 * @param {PagesOptions} options - page build options
 * @returns {Promise<string>} Template HTML
 */
export async function getBaseTemplateHtml(options) {
	const rootDir = getRootDir();
	const templateFilePath = path.join(rootDir, "site/template.html");
	let templateString = (await fs.readFile(templateFilePath)).toString();

	if (options.hotReload) {
		const hotReloadHtmlFilePath = path.join(rootDir, "site/hotreload.html");
		const hotReloadHtml = (await fs.readFile(hotReloadHtmlFilePath)).toString();
		templateString = templateString.replace("{{{DEV}}}", hotReloadHtml);
	} else {
		templateString = templateString.replace("{{{DEV}}}", "");
	}

	if (options.preview) {
		templateString = templateString
			.replace("{{{PREVIEW_STYLES}}}", PREVIEW_STYLES_HTML)
			.replace("{{{THEME_INIT}}}", THEME_INIT_SCRIPT)
			.replace("{{{PREVIEW_TOOLBAR}}}", THEME_TOOLBAR_HTML);
	} else {
		templateString = templateString
			.replace("{{{PREVIEW_STYLES}}}", "")
			.replace("{{{THEME_INIT}}}", "")
			.replace("{{{PREVIEW_TOOLBAR}}}", "");
	}

	return templateString;
}

/**
 * Mark the nav link matching the given route with `aria-current="page"`
 * at build time, so the current page is programmatically determinable
 * without relying on client JavaScript.
 * @param {string} html - rendered page HTML
 * @param {string} route - absolute route for this page, e.g. "/" or "/about.html"
 * @returns {string} HTML with aria-current applied
 */
export function injectAriaCurrent(html, route) {
	const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const linkPattern = new RegExp(`(<a href="${escapedRoute}")(>)`, "g");
	return html.replace(linkPattern, '$1 aria-current="page"$2');
}

/**
 * Resolve the `{{{PAGE_STYLES}}}` placeholder against `PAGE_STYLES` for a
 * given source filename (without extension). Every page-producing code
 * path must call this exactly once so no literal placeholder ever reaches
 * output.
 * @param {string} html - rendered page HTML still containing the placeholder
 * @param {string | undefined} fileName - source filename key into `PAGE_STYLES`
 * @returns {string} HTML with the placeholder resolved
 */
function injectPageStyles(html, fileName) {
	const names = fileName ? PAGE_STYLES[fileName] : undefined;
	const linksHtml = (names || [])
		.map((name) => `<link rel="stylesheet" href="/styles/${name}.css" />`)
		.join("\n        ");
	return html.replace("{{{PAGE_STYLES}}}", linksHtml);
}

/**
 * Build a page.
 * @param {string} title - page title (will be HTML-escaped)
 * @param {string} content - content for the page
 * @param {"md" | "html"} contentType - content type of the page
 * @param {string} baseTemplateHtml - base template to build from.
 * @param {string} route - absolute route for this page, used for aria-current.
 * @param {string} fileName - source filename (without extension), used to look up page-specific styles.
 * @returns {string} Final page HTML content
 */
function buildPageHtml(
	title,
	content,
	contentType,
	baseTemplateHtml,
	route,
	fileName,
) {
	const parsedContent =
		contentType === "html"
			? content
			: `<main class="flex-center-column"><section class="flex-column flex-start prose">${new showdown.Converter().makeHtml(
					content,
				)}</section></main>`;
	const html = injectPageStyles(
		baseTemplateHtml
			.replace("{{{TITLE}}}", escapeHtml(title === "Index" ? "Home" : title))
			.replace("{{{CONTENT}}}", parsedContent),
		fileName,
	);
	return injectAriaCurrent(html, route);
}

/**
 * Builds all HTML pages wrapped with the template file for a given directory.
 * @param {string} baseTemplateHtml - base template to build from.
 * @param {string} rootDirectoryPath - Path for the root of the directory to build
 * @returns {Promise<void>}
 */
async function buildPagesInDirectory(baseTemplateHtml, rootDirectoryPath) {
	const inputPageFiles = await readDirRecursive(rootDirectoryPath);
	const outDir = getOutputDir();
	/**
	 * @type {Promise<void>[]}
	 */
	const outputPageWritePs = [];
	for (const inputPageFile of inputPageFiles) {
		const relPath = path.relative(rootDirectoryPath, inputPageFile.absPath);
		if (inputPageFile.isDirectory) {
			const dirPath = path.join(outDir, relPath);
			if (!(await exists(dirPath)))
				await fs.mkdir(dirPath, { recursive: true });
			continue;
		}
		const [fileName, fileType] = inputPageFile.name.split(".");
		if (!["md", "html"].includes(fileType)) {
			console.error(
				`File ${inputPageFile.name} at ${inputPageFile.dirAbsPath} is not a valid type. Must be "md" or "html".`,
			);
			throw new Error(`Invalid page file: ${inputPageFile.name}.`);
		}
		const relDir = path.dirname(relPath);
		const outputFilePath = path.join(
			relDir === "." ? "" : relDir,
			`${fileName}.html`,
		);
		const route = `/${outputFilePath.split(path.sep).join("/")}`;
		const title = fileName
			.split(/[-_]/)
			.map(
				(titlePart) =>
					`${titlePart[0].toUpperCase()}${titlePart.slice(1).toLowerCase()}`,
			)
			.join(" ");
		const content = (await fs.readFile(inputPageFile.absPath)).toString();
		const pageHtml = buildPageHtml(
			title,
			content,
			fileType,
			baseTemplateHtml,
			route === "/index.html" ? "/" : route,
			fileName,
		);

		const outputPagePath = path.join(outDir, outputFilePath);
		outputPageWritePs.push(fs.writeFile(outputPagePath, pageHtml));
	}

	await Promise.all(outputPageWritePs);
}

/**
 * Build the Journal listing page and each post's article page from
 * `site/content/posts`. Draft/demo posts are only included when building
 * in preview mode; production builds show only published posts and an
 * honest empty state when none exist yet.
 * @param {string} baseTemplateHtml
 * @param {PagesOptions} options
 * @returns {Promise<void>}
 */
async function buildJournalPages(baseTemplateHtml, options) {
	const outDir = getOutputDir();
	const allPosts = await loadPosts();
	const visiblePosts = options.preview
		? allPosts
		: allPosts.filter(
				(post) => post.meta.status === "published" && !post.meta.layoutExample,
			);

	const allTags = [
		...new Set(visiblePosts.flatMap((post) => post.meta.tags)),
	].sort();
	const filterButtons = [
		`<button type="button" data-tag="all" aria-pressed="true">All <span class="count">(${visiblePosts.length})</span></button>`,
		...allTags.map((tag) => {
			const count = visiblePosts.filter((post) =>
				post.meta.tags.includes(tag),
			).length;
			return `<button type="button" data-tag="${tag}" aria-pressed="false">${tag} <span class="count">(${count})</span></button>`;
		}),
	].join("");

	const listHtml =
		visiblePosts.length === 0
			? `<div class="journal-empty">
                <p>No posts yet.</p>
               </div>`
			: `<div class="journal-filters" role="group" aria-label="Filter by tag">${filterButtons}</div>
               <p class="journal-filter-status" role="status" aria-live="polite"></p>
               <ul class="journal-list">${visiblePosts
									.map(renderJournalCard)
									.join("")}</ul>
			   <script src="/scripts/journal-filter.js" defer></script>`;

	const journalIndexContent = `<main class="flex-center-column">
        <section class="flex-column flex-start prose journal-index">
            <h1>Journal</h1>
            ${listHtml}
        </section>
    </main>`;

	const journalIndexHtml = injectAriaCurrent(
		injectPageStyles(
			baseTemplateHtml
				.replace("{{{TITLE}}}", "Journal")
				.replace("{{{CONTENT}}}", journalIndexContent),
			"journal",
		),
		"/journal.html",
	);
	await fs.writeFile(path.join(outDir, "journal.html"), journalIndexHtml);

	const journalDir = path.join(outDir, "journal");
	if (!(await exists(journalDir)))
		await fs.mkdir(journalDir, { recursive: true });

	await Promise.all(
		visiblePosts.map(async (post) => {
			const articleHtml = injectAriaCurrent(
				injectPageStyles(
					baseTemplateHtml
						.replace("{{{TITLE}}}", escapeHtml(post.meta.title))
						.replace("{{{CONTENT}}}", renderArticleHtml(post)),
					`journal-${post.slug}`,
				),
				"/journal.html",
			);
			await fs.writeFile(
				path.join(journalDir, `${post.slug}.html`),
				articleHtml,
			);
		}),
	);

	return visiblePosts;
}

/**
 * Fill in the homepage's recent-Journal preview placeholder with an honest
 * summary of up to three visible posts, or an empty-state message if none
 * are published yet.
 * @param {LoadedPost[]} visiblePosts
 * @returns {Promise<void>}
 */
async function fillHomeJournalPreview(visiblePosts) {
	const outDir = getOutputDir();
	const indexPath = path.join(outDir, "index.html");
	if (!(await exists(indexPath, "file"))) return;
	const indexHtml = (await fs.readFile(indexPath)).toString();

	const previewHtml =
		visiblePosts.length === 0
			? "<p>No posts yet.</p>"
			: `<ul class="journal-list">${visiblePosts
					.slice(0, 3)
					.map(renderJournalCard)
					.join("")}</ul>`;

	await fs.writeFile(
		indexPath,
		indexHtml.replace("{{{JOURNAL_PREVIEW}}}", previewHtml),
	);
}

const DIRECTIONS = [
	{
		id: "field-notes",
		name: "Field Notes",
		description: "Warm paper, charcoal type, muted green accents.",
	},
	{
		id: "workshop",
		name: "Workshop",
		description: "Olive and cream, stitched borders, sidebar layout.",
	},
	{
		id: "nightfall",
		name: "Nightfall",
		description: "Dark background, rust accents, full-width camp photo.",
	},
	{
		id: "field-notes-nightfall",
		name: "Field Notes + Nightfall",
		description: "Dark surroundings, sepia reading panels, serif type.",
	},
];

/**
 * Render a small, non-photographic thumbnail that approximates a
 * direction's actual desktop composition (relative position/size of its
 * copy, rail, and photo regions) using the same proportions as the real
 * CSS layout, so the hub's claims are checkable rather than decorative.
 * @param {string} id - direction id
 * @returns {string}
 */
function renderDirectionThumb(id) {
	return `<div class="direction-thumb" data-direction="${id}" aria-hidden="true">
            <span class="thumb-media"></span>
            <span class="thumb-rail"></span>
            <span class="thumb-copy"></span>
        </div>`;
}

/**
 * Build the preview-only `/directions.html` comparison hub with links to
 * each theme applied across Home, Journal, and About.
 * @param {string} baseTemplateHtml
 * @returns {Promise<void>}
 */
async function buildDirectionsPage(baseTemplateHtml) {
	const outDir = getOutputDir();
	const cardsHtml = DIRECTIONS.map(
		(direction) => `<li class="direction-card">
            ${renderDirectionThumb(direction.id)}
            <h2>${direction.name}</h2>
            <p>${direction.description}</p>
            <div class="direction-links">
                <a class="button" href="/?theme=${direction.id}">Home</a>
                <a class="button" href="/about.html?theme=${direction.id}">About</a>
                <a class="button" href="/journal.html?theme=${direction.id}">Journal</a>
            </div>
        </li>`,
	).join("");

	const content = `<main class="flex-center-column">
        <section class="flex-column flex-start directions-hub">
            <h1>Compare directions</h1>
            <ul class="direction-cards">${cardsHtml}</ul>
        </section>
    </main>`;

	const html = injectAriaCurrent(
		injectPageStyles(
			baseTemplateHtml
				.replace("{{{TITLE}}}", "Directions")
				.replace("{{{CONTENT}}}", content),
			"directions",
		),
		"/directions.html",
	);
	await fs.writeFile(path.join(outDir, "directions.html"), html);
}

/**
 * Builds all HTML pages wrapped with the template file.
 * @param {PagesOptions} options - page build options
 * @returns {Promise<void>}
 */
export async function buildPages(options) {
	console.log("Building Pages...");
	const baseTemplateHtml = await getBaseTemplateHtml(options);

	const rootDir = getRootDir();
	const inputPageDir = path.join(rootDir, "site/pages");
	await buildPagesInDirectory(baseTemplateHtml, inputPageDir);
	const visiblePosts = await buildJournalPages(baseTemplateHtml, options);
	await fillHomeJournalPreview(visiblePosts);
	if (options.preview) {
		await buildDirectionsPage(baseTemplateHtml);
	}
	console.log("Finished building Pages");
}
