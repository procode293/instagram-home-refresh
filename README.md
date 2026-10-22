<div align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="Home Refresh for Instagram Logo" />
  <h1>Home Refresh for Instagram</h1>
  <p><strong>Seamless in-place refresh for Instagram desktop — just like the mobile app.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-brightgreen.svg" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Version-3.4.1-blue.svg" alt="Version 3.4.1" />
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
    <img src="https://img.shields.io/badge/Chrome-Extension-informational.svg" alt="Chrome Extension" />
  </p>
</div>

---

## ⚡ The Problem

On Instagram Web (desktop), clicking **Home** or your active tab while already on that page does not fetch new posts—it only scrolls up or does nothing. To see fresh content, desktop users are forced to hit `F5` or `Ctrl+R`.

Hard-reloading triggers:
- Jarring white screen flickers
- Heavy re-downloading of JavaScript bundles
- Lost media state and audio interruptions
- Several seconds of unnecessary loading

## ✨ The Solution

**Home Refresh for Instagram** brings the smooth mobile app refresh experience to your desktop browser. It hooks directly into Instagram's internal React / Relay / Redux environment to refetch fresh posts in place without a page reload.

---

## 🚀 Key Features

* **🖱️ In-Place Nav Refresh:** Click the active button for the page you're already on (**Home**, **Reels**, **Explore**, or **Profile**) to smoothly scroll to top and fetch new content.
* **⌨️ Keyboard Shortcuts:** Press <kbd>R</kbd> or <kbd>.</kbd> anywhere to trigger an instant refresh (smartly suppressed when typing comments, DMs, or search queries).
* **📱 Calibrated Pull-to-Refresh:** Pull down at the top of the feed using your mouse or a two-finger trackpad swipe. Includes momentum protection so fast scrolling up through posts never triggers an accidental reload.
* **🎨 Native Aesthetic:** Minimalist Instagram-themed gradient progress bar and light/dark theme-adaptive pull indicator.
* **🔒 100% Private & Lightweight:** Zero data collection, no ads, no trackers, and zero unnecessary browser permissions.

---

## 🛠️ Installation

### Option 1: Chrome Web Store
*(Link coming soon once approved)*

### Option 2: Install from Source (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/procode293/instagram-home-refresh.git
   ```
2. Open Google Chrome (or any Chromium browser like Brave, Edge, or Arc).
3. Navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the folder containing `manifest.json`.
7. Visit [instagram.com](https://www.instagram.com) and enjoy!

---

## 🧠 How It Works Under The Hood

Rather than reloading the DOM or firing blind HTTP requests, this extension operates in Chrome's `MAIN` world at `document_start` and connects directly with Instagram's web architecture:

1. **Fiber Tree Traversal:** Discovers Instagram's `CometRouterDispatcherContext`, Relay Store, and Redux Provider by walking React fiber parent nodes (`__reactFiber*`).
2. **Relay Query Re-execution:** For pages driven by Relay (Reels, Profile, Saved), active queries with active subscribers (`refCount > 0`) are re-executed against the network and pushed into mounted components.
3. **Explore Grid Refresh:** Dispatches `DYNAMIC_EXPLORE_GRID_RELAY_SYNC` through Redux dynamic explore actions to replace the grid smoothly.
4. **Feed Routing:** Dispatches internal router actions (`passthroughProps: { refreshFeed: true }`) to trigger native home feed refetches.

---

## ⌨️ Shortcuts Reference

| Shortcut | Action | Condition |
| :--- | :--- | :--- |
| <kbd>R</kbd> | Refresh current feed / page | When not focused on input, textarea, or contenteditable |
| <kbd>.</kbd> | Refresh current feed / page | When not focused on input, textarea, or contenteditable |
| **Trackpad Pull** | Pull-to-refresh | At the top of the feed (`scrollY == 0`), deliberate downward swipe |
| **Mouse Drag** | Pull-to-refresh | Click and drag down near the top header area |

---

## 🤝 Contributing

Contributions, issues, and feature suggestions are always welcome!
Feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the [MIT License](LICENSE).
