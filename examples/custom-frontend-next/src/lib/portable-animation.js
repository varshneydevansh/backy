// Generated from the hosted animation controller. Run scripts/generate-portable-animation-controller.mjs.

// packages/core/src/animation-sequence.ts
var BACKY_ANIMATION_SEQUENCE_MAX_STEPS = 24;
var BACKY_ANIMATION_SEQUENCE_MAX_SECONDS = 180;
var record = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
var state = (value) => {
  if (!record(value)) return void 0;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (!["x", "y", "scale", "rotation", "opacity"].includes(key) || typeof item !== "number" || !Number.isFinite(item)) return void 0;
    if (key === "opacity" ? item < 0 || item > 1 : key.startsWith("scale") ? item < 0 || item > 100 : Math.abs(item) > 1e5) return void 0;
    result[key] = item;
  }
  return result;
};
function normalizeBackyAnimationSequence(value) {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > BACKY_ANIMATION_SEQUENCE_MAX_STEPS) return void 0;
  const ids = /* @__PURE__ */ new Set(), steps = [];
  for (const raw of value.steps) {
    if (!record(raw) || typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 100 || ids.has(raw.id) || typeof raw.label !== "string" || raw.label.length > 100) return void 0;
    if (typeof raw.at !== "number" || !Number.isFinite(raw.at) || raw.at < 0 || typeof raw.duration !== "number" || !Number.isFinite(raw.duration) || raw.duration < 0 || raw.duration > 60 || raw.at + raw.duration > BACKY_ANIMATION_SEQUENCE_MAX_SECONDS) return void 0;
    if (raw.easing !== void 0 && (typeof raw.easing !== "string" || raw.easing.length > 100)) return void 0;
    const to = state(raw.to), from = raw.from === void 0 ? void 0 : state(raw.from);
    if (!to || !Object.keys(to).length || raw.from !== void 0 && !from) return void 0;
    ids.add(raw.id);
    steps.push({ id: raw.id, label: raw.label, at: raw.at, duration: raw.duration, ...raw.easing ? { easing: raw.easing } : {}, ...from ? { from } : {}, to });
  }
  return { version: 1, steps };
}
function backyAnimationSequenceFinalState(sequence) {
  return [...sequence.steps].sort((a, b) => a.at + a.duration - (b.at + b.duration)).reduce((result, step) => ({ ...result, ...step.to }), {});
}

// apps/public/src/lib/animationHydration.ts
var record2 = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
var nonnegative = (value, fallback) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
var text = (value, fallback) => typeof value === "string" && value.trim() ? value : fallback;
function parseAnimationConfig(raw) {
  const input = record2(JSON.parse(raw));
  if (!["fadeIn", "slideIn", "scaleIn", "bounce", "rotate", "custom"].includes(String(input.type))) return void 0;
  const sequence = input.sequence === void 0 ? void 0 : normalizeBackyAnimationSequence(input.sequence);
  if (input.sequence !== void 0 && !sequence) return void 0;
  const scroll = record2(input.scrollTrigger);
  return {
    ...sequence ? { sequence } : {},
    type: input.type,
    duration: nonnegative(input.duration, 0.6),
    delay: nonnegative(input.delay, 0),
    easing: text(input.easing, input.type === "bounce" ? "bounce.out" : "power2.out"),
    direction: typeof input.direction === "string" ? input.direction : "up",
    trigger: input.trigger === "scroll" || input.trigger === "hover" ? input.trigger : "load",
    from: record2(input.from),
    to: record2(input.to),
    scrollTrigger: { start: text(scroll.start, "top 80%"), end: text(scroll.end, "bottom 20%"), scrub: scroll.scrub === true }
  };
}
function animationEndpoints(config, read) {
  const current = (key, fallback) => {
    const value = read(key);
    const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const from = {};
  const to = {};
  if (config.type === "custom") {
    Object.assign(from, config.from);
    for (const key of Object.keys(from)) to[key] = read(key);
  } else {
    const opacity = current("opacity", 1);
    const entranceOpacity = config.trigger === "hover" ? opacity * 0.75 : 0;
    if (["fadeIn", "slideIn", "scaleIn", "rotate"].includes(config.type)) {
      from.opacity = entranceOpacity;
      to.opacity = opacity;
    }
    if (config.type === "slideIn") {
      const horizontal = config.direction === "left" || config.direction === "right";
      const key = horizontal ? "x" : "y";
      const resting = current(key, 0);
      from[key] = resting + (config.direction === "left" || config.direction === "down" ? -50 : 50);
      to[key] = resting;
    } else if (config.type === "scaleIn") {
      from.scale = current("scale", 1) * 0.8;
      to.scale = current("scale", 1);
    } else if (config.type === "bounce") {
      from.y = current("y", 0) - 20;
      to.y = current("y", 0);
    } else if (config.type === "rotate") {
      from.rotation = current("rotation", 0) - 180;
      to.rotation = current("rotation", 0);
    }
  }
  Object.assign(from, config.from);
  Object.assign(to, config.to);
  return { from, to };
}
var hosts = /* @__PURE__ */ new WeakMap();
function acquireAnimationHydration(options) {
  let host = hosts.get(options.root);
  if (!host) {
    host = { references: 0, dispose: installAnimationHydration(options) };
    hosts.set(options.root, host);
  }
  host.references += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--host.references === 0) {
      host.dispose();
      hosts.delete(options.root);
    }
  };
}
function installAnimationHydration({
  root,
  engine,
  scroller,
  media = window.matchMedia("(prefers-reduced-motion: reduce)"),
  createObserver = (callback) => new MutationObserver(callback),
  reportError = (error) => console.error("Invalid Backy animation:", error)
}) {
  const entries = /* @__PURE__ */ new Map();
  let disposed = false;
  const release = (element) => {
    entries.get(element)?.dispose();
    entries.delete(element);
  };
  const hydrate = (element, raw) => {
    let context;
    const listeners = [];
    try {
      const config = parseAnimationConfig(raw);
      if (!config) return () => {
      };
      const { from, to } = animationEndpoints(config, (key) => engine.getProperty(element, key));
      context = engine.context(() => {
      }, element);
      context.add(() => {
        if (media.matches) {
          engine.set(element, config.sequence ? backyAnimationSequenceFinalState(config.sequence) : to);
          return;
        }
        const triggerOptions = {
          ...config.trigger === "hover" ? { paused: true } : {},
          ...config.trigger === "scroll" ? { scrollTrigger: { trigger: element, ...config.scrollTrigger, ...scroller ? { scroller } : {} } } : {}
        };
        const tween = config.sequence ? engine.timeline({ delay: config.delay, ...triggerOptions }) : engine.fromTo(element, from, { ...to, duration: config.duration, delay: config.delay, ease: config.easing, ...triggerOptions });
        if (config.sequence) {
          const timeline = tween;
          [...config.sequence.steps].sort((a, b) => a.at - b.at).forEach((step, index) => {
            const vars = { ...step.to, duration: step.duration, ease: step.easing || config.easing, immediateRender: false };
            if (step.from) {
              const from2 = Object.fromEntries(Object.entries(step.from).filter(([key]) => key in step.to));
              timeline.fromTo(element, from2, { ...vars, immediateRender: index === 0 }, step.at);
            } else timeline.to(element, vars, step.at);
          });
        }
        if (config.trigger === "hover") {
          let hovering = false;
          let focused = element.contains(element.ownerDocument.activeElement);
          const update = () => {
            if (hovering || focused) tween.play();
            else tween.reverse();
          };
          const bind = (name, handler) => {
            element.addEventListener(name, handler);
            listeners.push(() => element.removeEventListener(name, handler));
          };
          bind("mouseenter", () => {
            hovering = true;
            update();
          });
          bind("mouseleave", () => {
            hovering = false;
            update();
          });
          bind("focusin", () => {
            focused = true;
            update();
          });
          bind("focusout", (event) => {
            focused = element.contains(event.relatedTarget);
            update();
          });
          if (focused) update();
        }
      });
    } catch (error) {
      listeners.forEach((remove) => remove());
      context?.revert();
      reportError(error);
      return () => {
      };
    }
    return () => {
      listeners.forEach((remove) => remove());
      context?.revert();
    };
  };
  const reconcile = () => {
    if (disposed) return;
    const nodes = new Set(root.querySelectorAll("[data-animation]"));
    if (root.nodeType === 1 && root.hasAttribute("data-animation")) nodes.add(root);
    for (const element of entries.keys()) if (!nodes.has(element)) release(element);
    for (const element of nodes) {
      const raw = element.getAttribute("data-animation") || "";
      if (entries.get(element)?.raw === raw) continue;
      release(element);
      entries.set(element, { raw, dispose: hydrate(element, raw) });
    }
  };
  const motionChange = () => {
    for (const element of [...entries.keys()]) release(element);
    reconcile();
  };
  const observer = createObserver(reconcile);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-animation"] });
  media.addEventListener("change", motionChange);
  reconcile();
  return () => {
    disposed = true;
    observer.disconnect();
    media.removeEventListener("change", motionChange);
    for (const element of [...entries.keys()]) release(element);
  };
}
export {
  acquireAnimationHydration,
  animationEndpoints,
  installAnimationHydration,
  parseAnimationConfig
};
