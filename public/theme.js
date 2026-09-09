// Runs before the app stylesheet is discovered to avoid a light flash at startup.
// This separate same-origin script works with the wallet's strict script CSP.
(function () {
  var preference = "system";
  try {
    var saved = localStorage.getItem("quantus-wallet-theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch (_) {}
  var dark = preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var theme = dark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  // The app stylesheet has not loaded yet; set the canvas color immediately.
  document.documentElement.style.backgroundColor = dark ? "#101412" : "#fcfcfc";
  document.querySelector('meta[name="theme-color"]').setAttribute(
    "content", dark ? "#101412" : "#fcfcfc"
  );
})();
