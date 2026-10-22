// Apply the stored (or system) theme before first paint, so there's no light-mode flash for
// a user who has dark mode saved. Loaded by index.html, before the app.
(function () {
  try {
    var t = localStorage.getItem("theme");
    var dark = t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
