(() => {
  const validPage = /^https:\/\/(?:www\.)?meshy\.ai$/i.test(location.origin);
  if (!validPage) return;

  const found = new Map();
  const meshExtension = /\.meshy(?:$|[?#])/i;

  function add(raw) {
    if (typeof raw !== "string" || raw.length > 8192) return;
    let url;
    try { url = new URL(raw, location.href); } catch { return; }
    if (url.protocol !== "https:" || !meshExtension.test(url.pathname)) return;
    if (url.username || url.password) return;
    found.set(url.href, { url: url.href, host: url.host, path: url.pathname.split("/").pop() || "model.meshy" });
  }

  function scan() {
    try {
      for (const entry of performance.getEntriesByType("resource")) add(entry.name);
    } catch { /* Performance entries may be unavailable in restricted contexts. */ }
    for (const node of document.querySelectorAll("a[href], [src]")) {
      add(node.href || node.src || node.getAttribute("src"));
    }
  }

  scan();
  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "href"] });
  const timer = setInterval(scan, 2000);
  setTimeout(() => { clearInterval(timer); observer.disconnect(); }, 10 * 60 * 1000);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_MESHY_RESOURCES") {
      scan();
      sendResponse({ resources: [...found.values()] });
    }
  });
})();
