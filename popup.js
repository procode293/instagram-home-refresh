document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-ig-btn");
  const rateBtn = document.getElementById("rate-btn");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: "https://www.instagram.com/" });
    });
  }

  if (rateBtn) {
    rateBtn.addEventListener("click", () => {
      const extId = chrome.runtime.id;
      const url = extId
        ? `https://chromewebstore.google.com/detail/${extId}/reviews`
        : "https://chromewebstore.google.com/";
      chrome.tabs.create({ url });
    });
  }
});
