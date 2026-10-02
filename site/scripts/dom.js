// Prevent jarring transitions of hidden elements on page load.
window.addEventListener(
	"load",
	() => {
		document.getElementById("no-transition-on-load")?.remove();
	},
	{ once: true },
);

// Add link-ability to headers with IDs
const headingLevels = [1, 2, 3, 4, 5, 6];
for (const heading of document.querySelectorAll(
	headingLevels.map((lvl) => `h${lvl}[id]`).join(", "),
)) {
	const headingLink = document.createElement("a");
	headingLink.setAttribute("href", `#${heading.getAttribute("id")}`);
	headingLink.className = "heading-link";
	for (const childNode of heading.childNodes) {
		heading.removeChild(childNode);
		headingLink.appendChild(childNode);
	}
	heading.appendChild(headingLink);
}
