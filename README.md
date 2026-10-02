# sewing-descent

Website for my sewing projects — static HTML built from Markdown + JSON
content, Sass styles, and a small custom static-site builder (no
framework/CMS).

## Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org) 20 or newer (tested on Node 20 and
    Node 24; see `engines` in `package.json`)

### Setup

```shell
npm ci
```

The first build downloads Punkboy for the distressed wordmark and caches
it under `static/`. The font is served locally, uses `font-display: swap`,
and is not committed to this repository. Its included license permits
personal use; commercial use requires a license from the author.
The download is checked against the reviewed font's SHA-256, and a changed
font or unavailable download fails the build explicitly. Later builds use
the cached font without a network request.

(`./setup.sh` does the same thing and exists only as a convenience
wrapper for CI; it installs the locked dependencies from
`package-lock.json` via `npm ci` and no longer downloads any external
font.)

### Build

Compile the website into the `dist/` directory (production — minified,
drafts and layout-example posts excluded):

```shell
npm run build
```

Build a **preview** instead (same minified, production-equivalent
runtime, but includes drafts and the two illustrative layout-example
posts, and shows an on-page theme/direction toolbar for comparing
Field Notes / Workshop / Nightfall / Field Notes + Nightfall):

```shell
npm run build:preview
```

### Dev

Compile the website whenever files change, hot-reload the browser, and
serve from `dist/` on <http://localhost:4567>:

```shell
npm start
```

For the preview variant (drafts + theme toolbar) in dev/watch mode:

```shell
npm run start:preview
```

Either dev command opens your browser automatically; pass `--no-open` to
skip that (for example when another process — your editor agent, a
script, or a parent process — is already serving/watching the page):

```shell
npm start -- --no-open
```

### Choosing a theme while previewing

A production build always ships **Field Notes + Nightfall** (the default,
no toolbar, no theme-switch code shipped). A preview build
(`npm run build:preview` / `npm run start:preview`) adds a small toolbar
and a `/directions.html` comparison hub so you (or whoever is deciding)
can try **Field Notes**, **Workshop**, **Nightfall**, and
**Field Notes + Nightfall**.
The hybrid keeps Field Notes' editorial layout, with a dark background
and light sepia panels for About, articles, and Journal cards. None of this
toolbar or comparison tooling is present in a production build.

### Tests

```shell
npm test
```

### Lint / format

```shell
npm run lint
npm run format
```

## Adding Journal content

Journal posts ("project" or "technique" write-ups) live under
`site/content/posts/<slug>/` as a `post.json` (metadata) + `body.md`
(Markdown body) pair. There's no upload form or admin UI — content is
added by creating/editing these files directly (an editor agent can do
this on your behalf; see `.github/agents/content-editor.agent.md` for
the exact workflow and required approval step before anything is
published). The build (`npm run build`) validates every post strictly —
bad dates, non-local image paths, missing alt text, wrong field types,
and similar mistakes fail the build with a specific error rather than
silently publishing something broken.

A new post's own photos go under `static/imgs/`; only use images you
actually own/supplied yourself (no stock downloads).

Always review a post as a **draft** in `npm run build:preview` /
`npm run start:preview` before setting `"status": "published"` in its
`post.json` and rebuilding for production.

## Hero image maintenance

The Home hero photo ships as four responsive `.webp` variants
(`static/imgs/sewing-descent-cover_{small,desktop,large,original}.webp`)
referenced from a `<picture>` element in `site/pages/index.html`. If that
photo is ever replaced, use the included one-off script (uses the
`sharp` dev dependency already installed, not a new dependency) to
re-derive correctly-sized, correctly-sharpened variants instead of
hand-exporting them:

```shell
node tools/derive-hero-variants.mjs path/to/new-photo.jpg
```

The script prints each variant's real pixel dimensions — update the
`<source>`/`<img>` `width`/`height` attributes and media-query
breakpoints in `site/pages/index.html` to match (don't carry old
numbers forward; a wrong intrinsic size causes layout shift).
