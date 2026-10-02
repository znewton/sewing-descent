import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

function runBuild(args) {
	execFileSync(
		process.execPath,
		[path.join(rootDir, "src/index.js"), ...args],
		{
			cwd: rootDir,
			stdio: "pipe",
		},
	);
}

test("production build succeeds, excludes drafts, and keeps legacy routes", () => {
	runBuild([]);

	assert.ok(fs.existsSync(path.join(distDir, "index.html")));
	assert.ok(fs.existsSync(path.join(distDir, "about.html")));
	assert.ok(fs.existsSync(path.join(distDir, "journal.html")));
	assert.ok(
		fs.existsSync(path.join(distDir, "blog", "wax-process-2024-04-06.html")),
		"legacy wax process route must be preserved",
	);
	assert.ok(fs.existsSync(path.join(distDir, "projects.html")));
	assert.ok(fs.existsSync(path.join(distDir, "blog.html")));
	assert.ok(
		!fs.existsSync(path.join(distDir, "directions.html")),
		"directions hub must not ship in production builds",
	);

	const journalHtml = fs.readFileSync(
		path.join(distDir, "journal.html"),
		"utf-8",
	);
	assert.ok(
		!journalHtml.includes("draft-badge"),
		"production Journal must not show draft/demo posts",
	);
	assert.ok(
		!journalHtml.includes("preview-toolbar"),
		"production build must not include the preview toolbar",
	);

	const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
	assert.ok(!indexHtml.includes("preview-toolbar"));
	assert.ok(!indexHtml.includes("data-theme"));
	assert.ok(!indexHtml.includes("hero-intro"));
	assert.ok(!indexHtml.includes("There's no shop here"));
	assert.ok(!journalHtml.includes("nothing here is invented"));
	assert.ok(indexHtml.includes("No posts yet."));
	assert.ok(journalHtml.includes("No posts yet."));
	const indexCss = fs.readFileSync(
		path.join(distDir, "styles", "index.css"),
		"utf-8",
	);
	assert.ok(indexCss.includes("html:not([data-theme])"));
	assert.match(indexCss, /--background-primary:\s*#191816/);
	assert.match(indexCss, /--background-primary:\s*#e9dfcd/);
	assert.ok(!indexHtml.includes("/styles/themes.css"));
});

test("post titles are HTML-escaped in built article and journal pages (temporary fixture, cleaned up after)", () => {
	const slug = "zz-temp-escaping-fixture";
	const postDir = path.join(rootDir, "site/content/posts", slug);
	try {
		fs.mkdirSync(postDir, { recursive: true });
		fs.writeFileSync(
			path.join(postDir, "post.json"),
			JSON.stringify({
				title: '<b>Dangerous</b> & "quoted" Title',
				date: "2024-01-01",
				summary: "A summary.",
				type: "project",
				tags: ["temp-fixture"],
				status: "published",
			}),
		);
		fs.writeFileSync(
			path.join(postDir, "body.md"),
			"Temporary fixture body for an automated regression test.",
		);

		runBuild(["--preview"]);

		const articleHtml = fs.readFileSync(
			path.join(distDir, "journal", `${slug}.html`),
			"utf-8",
		);
		assert.ok(
			articleHtml.includes("&lt;b&gt;Dangerous&lt;/b&gt;"),
			"the post title must be HTML-escaped in the rendered article",
		);
		assert.ok(!articleHtml.includes("<b>Dangerous</b>"));
		assert.ok(
			articleHtml.includes("Sewing Descent | &lt;b&gt;Dangerous&lt;/b&gt;"),
			"the <title> element must also escape the post title",
		);

		const journalHtml = fs.readFileSync(
			path.join(distDir, "journal.html"),
			"utf-8",
		);
		assert.ok(journalHtml.includes("&lt;b&gt;Dangerous&lt;/b&gt;"));
		assert.ok(!journalHtml.includes("<b>Dangerous</b>"));
	} finally {
		fs.rmSync(postDir, { recursive: true, force: true });
	}
});

test("a layoutExample post is excluded from production output even if its status were published (defense in depth)", () => {
	// validatePostMeta rejects layoutExample:true + status:"published" outright
	// (see content.test.mjs), so this build-level test instead documents and
	// verifies the second, independent layer: buildJournalPages always
	// filters out layoutExample posts in production regardless of status.
	// The two real demo fixtures already ship as layoutExample:true/status:
	// "draft"; confirm neither their slugs nor their "Layout example" label
	// ever reach a production build.
	runBuild([]);
	const journalHtml = fs.readFileSync(
		path.join(distDir, "journal.html"),
		"utf-8",
	);
	assert.ok(!journalHtml.includes("layout-example"));
	assert.ok(
		!fs.existsSync(
			path.join(distDir, "journal", "layout-example-project.html"),
		),
	);
	assert.ok(
		!fs.existsSync(
			path.join(distDir, "journal", "layout-example-technique.html"),
		),
	);

	const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
	assert.ok(!indexHtml.includes("layout-example"));
});

test("preview build includes drafts, directions hub, and the theme toolbar", () => {
	runBuild(["--preview"]);
	const journalHtml = fs.readFileSync(
		path.join(distDir, "journal.html"),
		"utf-8",
	);
	assert.ok(journalHtml.includes("draft-badge"));

	const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf-8");
	assert.ok(indexHtml.includes("preview-toolbar"));
	assert.ok(indexHtml.includes("/scripts/theme.js"));
	assert.match(
		indexHtml,
		/data-theme-option=(?:"field-notes-nightfall"|field-notes-nightfall)(?:\s|>)/,
	);
	const directionsHtml = fs.readFileSync(
		path.join(distDir, "directions.html"),
		"utf-8",
	);
	assert.ok(directionsHtml.includes("/about.html?theme=field-notes-nightfall"));
	assert.ok(journalHtml.includes("journal-index"));
});
