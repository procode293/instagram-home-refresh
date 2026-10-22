// Refresh Instagram in place, like the mobile app:
// 1. Click the active button for the page you're already on (Home, Reels, Explore, Profile...)
// 2. Press 'r' or '.' on your keyboard (power-user shortcut)
// 3. Pull down at the top of the feed with your mouse or trackpad
//
// Hooks into Instagram's internal React / Relay / Redux tree in MAIN world.

(function () {
  // Queries that belong to the sidebar, badges or background pages
  const SKIP_QUERIES =
    /^(IGD|QuickPromotion|usePolarisNotificationsNavItem|PolarisSearchBoxContainer|PolarisAPIGetFrCookie|usePolarisCentralizedUpsellState|PolarisStoriesV3TrayContainer|PolarisClipsAdsPool)/;

  let busy = false;
  const DEBUG = false;
  let lastDiag = "";

  // ---------------------------------------------------------
  // Top loading progress bar
  // ---------------------------------------------------------
  let bar = null;
  function showProgress(on) {
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "ig-refresh-progress-bar";
      bar.style.cssText =
        "position:fixed;top:0;left:0;height:3px;width:0;z-index:2147483647;pointer-events:none;" +
        "background:linear-gradient(90deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5);" +
        "transition:width 2.5s ease-out,opacity .3s;opacity:0";
      document.documentElement.appendChild(bar);
    }
    if (on) {
      bar.style.transition = "none";
      bar.style.width = "0";
      bar.style.opacity = "1";
      void bar.offsetWidth;
      bar.style.transition = "width 2.5s ease-out,opacity .3s";
      bar.style.width = "85%";
    } else {
      bar.style.transition = "width .2s,opacity .3s .2s";
      bar.style.width = "100%";
      bar.style.opacity = "0";
    }
  }

  // ---------------------------------------------------------
  // Toast notifications
  // ---------------------------------------------------------
  let toastEl = null;
  let toastTimer = null;
  function toast(message, ms = 1800) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "ig-refresh-toast";
      toastEl.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;max-width:80vw;" +
        "pointer-events:none;padding:8px 14px;border-radius:16px;font:500 13px/1.4 system-ui,sans-serif;" +
        "color:#fff;background:rgba(38,38,38,.92);box-shadow:0 2px 8px rgba(0,0,0,.3);" +
        "transition:opacity .25s;opacity:0";
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.opacity = "0";
    }, ms);
  }

  // ---------------------------------------------------------
  // Pull-to-Refresh Visual Indicator
  // ---------------------------------------------------------
  let pullEl = null;
  let pullSvg = null;
  let pullSpinAnim = null;

  function getPullIndicator() {
    if (!pullEl) {
      pullEl = document.createElement("div");
      pullEl.id = "ig-pull-to-refresh-indicator";
      pullEl.style.cssText =
        "position:fixed;top:-55px;left:50%;transform:translateX(-50%);z-index:2147483646;" +
        "width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;" +
        "pointer-events:none;transition:top .2s ease-out, opacity .2s ease-out;";

      pullEl.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform-origin:center;transition:transform .12s ease;">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
      `;
      pullSvg = pullEl.querySelector("svg");
      document.documentElement.appendChild(pullEl);
    }

    const isDark =
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ||
      document.documentElement.classList.contains("dark") ||
      document.body.classList.contains("dark");

    pullEl.style.background = isDark ? "#262626" : "#ffffff";
    pullEl.style.boxShadow = isDark ? "0 4px 14px rgba(0,0,0,.6)" : "0 4px 14px rgba(0,0,0,.15)";
    if (pullSvg) {
      pullSvg.style.color = isDark ? "#f5f5f5" : "#262626";
    }
    return pullEl;
  }

  function showPullIndicator(progressPx, reached) {
    const el = getPullIndicator();
    const top = Math.min(24, -48 + progressPx);
    el.style.top = top + "px";
    el.style.opacity = String(Math.min(1, progressPx / 35));
    if (pullSvg && !pullSpinAnim) {
      pullSvg.style.transform = `rotate(${progressPx * 4}deg) scale(${reached ? 1.1 : 1})`;
    }
  }

  function startPullSpinner() {
    const el = getPullIndicator();
    el.style.top = "20px";
    el.style.opacity = "1";
    if (pullSvg && !pullSpinAnim) {
      pullSpinAnim = pullSvg.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 700, iterations: Infinity, easing: "linear" }
      );
    }
  }

  function hidePullIndicator() {
    if (!pullEl) return;
    if (pullSpinAnim) {
      pullSpinAnim.cancel();
      pullSpinAnim = null;
    }
    pullEl.style.top = "-55px";
    pullEl.style.opacity = "0";
    if (pullSvg) pullSvg.style.transform = "rotate(0deg)";
  }

  // ---------------------------------------------------------
  // Helpers & Instagram Internals Discovery
  // ---------------------------------------------------------
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
  }

  function waitFor(condition, ms) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (condition() || Date.now() - started > ms) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  function safeRequire(name) {
    try {
      return window.require(name);
    } catch (e) {
      return null;
    }
  }

  function getInternals(el) {
    const routerCtx = safeRequire("CometRouterDispatcherContext");
    const fiberKey = el && Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    const found = { router: null, relay: null, redux: null };
    if (!routerCtx || !fiberKey) return found;
    for (let f = el[fiberKey]; f; f = f.return) {
      const props = f.memoizedProps;
      const value = props && props.value;
      if (!found.router && (f.type === routerCtx || (f.type && f.type._context === routerCtx))) {
        if (value && typeof value.go === "function") found.router = value;
      }
      if (!found.relay && value && value.environment && typeof value.environment.getStore === "function") {
        found.relay = value.environment;
      }
      if (!found.redux) {
        const store = (props && props.store) || (value && value.store);
        if (store && typeof store.getState === "function" && typeof store.dispatch === "function") {
          found.redux = store;
        }
      }
    }
    return found;
  }

  // Attempt to resolve Instagram's React contexts from known DOM elements
  function resolveInternals() {
    const selectors = [
      "a[href='/']",
      "nav a",
      "header a",
      "main article",
      "main",
      "div[role='navigation']",
      "a[role='link']",
      "a"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const res = getInternals(el);
      if (res.router || res.relay || res.redux) return res;
    }
    return { router: null, relay: null, redux: null };
  }

  function normalizePath(path) {
    return path.endsWith("/") ? path : path + "/";
  }

  function isCurrentPage(linkPath) {
    const here = normalizePath(location.pathname);
    linkPath = normalizePath(linkPath);
    if (linkPath === here) return true;
    return linkPath === "/reels/" && here.startsWith("/reels/");
  }

  function isAtTop() {
    if (window.scrollY > 4 || document.documentElement.scrollTop > 4) return false;
    const main = document.querySelector("main");
    if (main && main.scrollTop > 4) return false;
    const scrollContainer = document.querySelector("main div[style*='overflow']");
    if (scrollContainer && scrollContainer.scrollTop > 4) return false;
    return true;
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable || el.getAttribute("contenteditable") === "true") return true;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    const role = el.getAttribute("role");
    if (role === "textbox" || role === "combobox" || role === "searchbox") return true;
    return false;
  }

  // ---------------------------------------------------------
  // Page Refresh Operations
  // ---------------------------------------------------------
  function refreshFeed(router) {
    router.go("/", { passthroughProps: { refreshFeed: true } });
  }

  async function refreshHome(router) {
    if (location.pathname !== "/") {
      refreshFeed(router);
      await waitFor(() => location.pathname === "/" && document.querySelector("main article"), 10000);
    }
    const first = document.querySelector("main article");
    refreshFeed(router);
    await waitFor(() => {
      const now = document.querySelector("main article");
      return now && now !== first;
    }, 8000);
  }

  async function refreshExplore(redux) {
    const actions = safeRequire("PolarisDynamicExploreActions");
    if (!redux || !actions || !actions.requestDynamicExploreGrid) return;
    const state = redux.getState().dynamicExplore || {};
    const thunk = actions.requestDynamicExploreGrid({
      cursor: null,
      initialRequest: true,
      isNonPersonalizedExplore: !!state.isNonPersonalizedExplore,
    });
    const dispatch = (action) =>
      redux.dispatch(
        action && action.type === "DYNAMIC_EXPLORE_GRID_LOADED"
          ? Object.assign({}, action, { type: "DYNAMIC_EXPLORE_GRID_RELAY_SYNC" })
          : action
      );
    await thunk(dispatch, redux.getState);
  }

  async function refreshRelay(relay, diag) {
    if (!relay) {
      diag.push("no relay env");
      return;
    }
    const store = relay.getStore();
    const roots = Object.values(store).find(
      (v) => v instanceof Map && v.size && [...v.values()][0] && [...v.values()][0].operation
    );
    if (!roots) {
      diag.push("no relay roots");
      return;
    }
    const all = [...roots.values()];
    const active = all.filter(
      (r) => r.refCount > 0 && !SKIP_QUERIES.test(r.operation.request.node.params.name)
    );
    diag.push("roots " + all.length + ", refetching " + active.length);
    await Promise.all(
      active.map(
        (r) =>
          new Promise((resolve) => {
            const name = r.operation.request.node.params.name.replace(/^Polaris|Query$/g, "");
            const started = Date.now();
            relay.execute({ operation: r.operation }).subscribe({
              complete: () => {
                diag.push(name + " ok " + (Date.now() - started) + "ms");
                resolve();
              },
              error: (e) => {
                diag.push(name + " ERR " + String(e && e.message).slice(0, 60));
                resolve();
              },
            });
          })
      )
    );
  }

  function scrollToTop() {
    window.scrollTo(0, 0);
    const main = document.querySelector("main");
    if (!main) return;
    for (const el of main.querySelectorAll("*")) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  }

  async function refreshCurrentPage(internals) {
    const diag = [];
    window.scrollTo(0, 0);
    if (normalizePath(location.pathname) === "/explore/") {
      await refreshExplore(internals.redux);
    }
    await refreshRelay(internals.relay, diag);
    scrollToTop();
    if (DEBUG) {
      lastDiag = diag.join(" · ");
    }
  }

  function run({ goingHome, internals }) {
    if (busy) return;
    busy = true;
    lastDiag = "";
    showProgress(true);
    const work = goingHome ? refreshHome(internals.router) : refreshCurrentPage(internals);
    withTimeout(work, 15000)
      .then(() =>
        DEBUG && !goingHome && lastDiag
          ? toast("Refreshed · " + lastDiag, 120000)
          : toast(goingHome ? "Feed refreshed" : "Refreshed")
      )
      .catch(() => toast("Refresh failed"))
      .finally(() => {
        busy = false;
        showProgress(false);
        hidePullIndicator();
      });
  }

  // Trigger refresh programmatically (keyboard shortcut or pull gesture)
  function triggerRefresh() {
    if (busy) return;
    const goingHome = normalizePath(location.pathname) === "/";
    const internals = resolveInternals();
    if (!internals.router && !internals.relay && !internals.redux) {
      toast("Instagram Refresh couldn't hook into this page");
      hidePullIndicator();
      return;
    }
    run({ goingHome, internals });
  }

  // ---------------------------------------------------------
  // Feature 1: Keyboard Shortcuts ('r' / '.')
  // ---------------------------------------------------------
  function onKeyDown(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isEditable(event.target) || isEditable(document.activeElement)) return;

    if (event.key === "r" || event.key === "R" || event.key === ".") {
      event.preventDefault();
      triggerRefresh();
    }
  }
  window.addEventListener("keydown", onKeyDown, true);

  // ---------------------------------------------------------
  // Feature 2: Pull-to-Refresh Gesture (Mouse Drag & Wheel)
  // ---------------------------------------------------------
  let pullStartY = 0;
  let pullStartX = 0;
  let isPullDragging = false;
  let currentDragRatio = 0;

  // Higher deliberate thresholds and deadzones to eliminate accidental triggers
  const DRAG_DEADZONE = 35;
  const DRAG_THRESHOLD = 130;

  const WHEEL_DEADZONE = 180;
  const WHEEL_THRESHOLD = 560;

  // Momentum guard: ignore wheel events if the user just scrolled up to the top
  let reachedTopTimestamp = 0;
  let wasAtTop = isAtTop();

  function trackScrollTopState() {
    const atTop = isAtTop();
    if (atTop && !wasAtTop) {
      reachedTopTimestamp = Date.now();
    }
    wasAtTop = atTop;
  }

  window.addEventListener("scroll", trackScrollTopState, { passive: true });

  function onGlobalPointerDown(event) {
    if (event.button !== 0 || busy) return;
    if (!isAtTop()) return;
    // Don't intercept interactive elements
    if (event.target.closest("a, button, input, textarea, video, [role='button'], [role='dialog'], [role='menu']")) {
      return;
    }
    // Only engage drag if pointer starts in upper 120px
    if (event.clientY > 120) return;

    pullStartY = event.clientY;
    pullStartX = event.clientX;
    isPullDragging = true;
    currentDragRatio = 0;
  }

  function onGlobalPointerMove(event) {
    if (!isPullDragging || busy) return;
    if (!isAtTop()) {
      isPullDragging = false;
      hidePullIndicator();
      return;
    }

    const deltaY = event.clientY - pullStartY;
    const deltaX = Math.abs(event.clientX - pullStartX);

    // If moving sideways more than down, cancel drag
    if (deltaX > 35 && deltaX > deltaY) {
      isPullDragging = false;
      hidePullIndicator();
      return;
    }

    if (deltaY > DRAG_DEADZONE) {
      const effectivePull = deltaY - DRAG_DEADZONE;
      currentDragRatio = Math.min(1, effectivePull / (DRAG_THRESHOLD - DRAG_DEADZONE));
      showPullIndicator(currentDragRatio * 75, currentDragRatio >= 1);
    } else {
      hidePullIndicator();
    }
  }

  function onGlobalPointerUp() {
    if (!isPullDragging) return;
    isPullDragging = false;
    if (currentDragRatio >= 1 && !busy) {
      startPullSpinner();
      triggerRefresh();
    } else if (!busy) {
      hidePullIndicator();
    }
    currentDragRatio = 0;
  }

  // Trackpad / Wheel overscroll
  let wheelAccumulator = 0;
  let wheelResetTimer = null;

  function onGlobalWheel(event) {
    if (busy) return;
    trackScrollTopState();

    if (!isAtTop()) {
      wheelAccumulator = 0;
      return;
    }

    // If momentum carried the user to the top within the last 400ms, ignore inertia
    if (Date.now() - reachedTopTimestamp < 400) {
      wheelAccumulator = 0;
      return;
    }

    if (event.deltaY < 0) {
      wheelAccumulator += Math.abs(event.deltaY);
      clearTimeout(wheelResetTimer);

      if (wheelAccumulator > WHEEL_DEADZONE) {
        const effectivePull = wheelAccumulator - WHEEL_DEADZONE;
        const progressRatio = Math.min(1, effectivePull / (WHEEL_THRESHOLD - WHEEL_DEADZONE));
        showPullIndicator(progressRatio * 75, progressRatio >= 1);

        if (progressRatio >= 1) {
          wheelAccumulator = 0;
          startPullSpinner();
          triggerRefresh();
          return;
        }
      }

      wheelResetTimer = setTimeout(() => {
        wheelAccumulator = 0;
        if (!busy) hidePullIndicator();
      }, 200);
    } else if (event.deltaY > 0) {
      wheelAccumulator = 0;
      if (!busy) hidePullIndicator();
    }
  }

  window.addEventListener("pointerdown", onGlobalPointerDown, { passive: true });
  window.addEventListener("pointermove", onGlobalPointerMove, { passive: true });
  window.addEventListener("pointerup", onGlobalPointerUp, { passive: true });
  window.addEventListener("wheel", onGlobalWheel, { passive: true });

  // ---------------------------------------------------------
  // Existing Nav Link Interception
  // ---------------------------------------------------------
  function matchTarget(event) {
    if (event.button !== 0) return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;

    const anchor = event.target.closest && event.target.closest("a[href]");
    if (!anchor) return null;
    let url;
    try {
      url = new URL(anchor.href, location.origin);
    } catch (e) {
      return null;
    }
    if (url.origin !== location.origin || anchor.getAttribute("href") === "#") return null;

    const goingHome = url.pathname === "/";
    if (!goingHome && !isCurrentPage(url.pathname)) return null;

    const internals = getInternals(anchor);
    if (!internals.router) {
      toast("Instagram Refresh couldn't hook into this page");
      return null;
    }
    return { anchor, goingHome, internals };
  }

  function swallow(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  let pending = null;

  function onNavPointerDown(event) {
    pending = null;
    const match = matchTarget(event);
    if (!match) return;
    pending = match;
    swallow(event);
  }

  function onNavPointerUp(event) {
    if (!pending) return;
    const match = pending;
    swallow(event);
    setTimeout(() => {
      if (pending === match) pending = null;
    }, 500);
    const anchor = event.target.closest && event.target.closest("a[href]");
    if (anchor && anchor.href === match.anchor.href) run(match);
  }

  function onNavMouseEvent(event) {
    if (pending) swallow(event);
  }

  function onNavClick(event) {
    if (pending) {
      swallow(event);
      pending = null;
      return;
    }
    const match = matchTarget(event);
    if (!match) return;
    swallow(event);
    run(match);
  }

  window.addEventListener("pointerdown", onNavPointerDown, true);
  window.addEventListener("pointerup", onNavPointerUp, true);
  window.addEventListener("mousedown", onNavMouseEvent, true);
  window.addEventListener("mouseup", onNavMouseEvent, true);
  window.addEventListener("click", onNavClick, true);

  console.info("[Instagram Home Refresh] v3.4.0 active (nav click, 'r'/'.' keys, pull-to-refresh)");
})();
