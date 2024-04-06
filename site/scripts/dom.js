// Prevent jarring transitions of hidden elements on page load.
window.addEventListener(
	"load",
	() => {
		document.getElementById("no-transition-on-load").remove();
	},
	{ once: true },
);

// Assign a visual cue to the nav links to show what page is shown.
for (const navLink of document.querySelectorAll(
	`nav a[href="/${document.URL.split("/").slice(-1).join("")}"]`,
)) {
	navLink.className += " current-link";
}

// Add link-ability to headers with IDs
const headingLevels = [1, 2, 3, 4, 5, 6];
for (const heading of document.querySelectorAll(
	headingLevels.map((lvl) => `h${lvl}[id]`).join(", "),
)) {
	const headingLink = document.createElement("a");
	headingLink.setAttribute("href", `#${headingLink.getAttribute("id")}`);
	for (const childNode of heading.childNodes) {
		headingLink.appendChild(childNode);
		heading.removeChild(childNode);
	}
	heading.appendChild(headingLink);
}
