// dist/core/util/html.util.js
var SSR_ATTR = "ssr";
var LAZY_ATTR = "lazy";
var RESERVED_ATTRS = new Set([SSR_ATTR, LAZY_ATTR, "style", "class", "id", "slot", "part"]);
var BLOCKED_PROTOCOLS = /^(javascript|data|vbscript):/i;
function assertSafeRedirect(url) {
  if (BLOCKED_PROTOCOLS.test(url.trim())) {
    throw new Error(`Unsafe redirect URL blocked: ${url}`);
  }
}
function escapeHtml(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("`", "&#96;");
}
function unescapeHtml(text) {
  return text.replaceAll("&#96;", "`").replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
}
function scopeWidgetCss(css, _widgetName) {
  return `@layer emroute {
${css}
}`;
}
var STATUS_MESSAGES = {
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  500: "Internal Server Error"
};

// dist/src/util/html.util.js
class SsrCSSStyleSheet {
  cssText = "";
  replaceSync(css) {
    this.cssText = css;
  }
  replace(css) {
    this.cssText = css;
    return Promise.resolve(this);
  }
}
var CSSStyleSheetBase = globalThis.CSSStyleSheet ?? SsrCSSStyleSheet;

class SsrShadowRoot {
  host;
  _innerHTML = "";
  _adoptedStyleSheets = [];
  constructor(host) {
    this.host = host;
  }
  get adoptedStyleSheets() {
    return this._adoptedStyleSheets;
  }
  set adoptedStyleSheets(sheets) {
    this._adoptedStyleSheets = sheets;
  }
  get innerHTML() {
    const adopted = this._adoptedStyleSheets.filter((s) => s.cssText).map((s) => `<style>${s.cssText}</style>`).join("");
    return adopted + this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = value;
  }
  setHTMLUnsafe(html, _options) {
    this._innerHTML = html;
  }
  append(..._nodes) {}
  querySelector(_selector) {
    return null;
  }
  querySelectorAll(_selector) {
    return [];
  }
  get childNodes() {
    return [];
  }
  get firstChild() {
    return null;
  }
}

class SsrElementInternals {
  states = new Set;
}

class SsrHTMLElement {
  _innerHTML = "";
  _shadowRoot = null;
  _attributes = new Map;
  style = new Proxy({}, {
    set(_target, _prop, _value) {
      return true;
    },
    get(_target, prop) {
      if (typeof prop === "string")
        return "";
      return;
    }
  });
  get innerHTML() {
    return this._innerHTML;
  }
  set innerHTML(value) {
    this._innerHTML = value;
  }
  get shadowRoot() {
    return this._shadowRoot;
  }
  get childNodes() {
    return [];
  }
  get firstChild() {
    return null;
  }
  get attributes() {
    const attrs = [];
    for (const [name, value] of this._attributes) {
      attrs.push({ name, value });
    }
    return attrs;
  }
  attachShadow(_init) {
    this._shadowRoot = new SsrShadowRoot(this);
    return this._shadowRoot;
  }
  attachInternals() {
    return new SsrElementInternals;
  }
  getAttribute(name) {
    return this._attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this._attributes.set(name, value);
  }
  removeAttribute(name) {
    this._attributes.delete(name);
  }
  hasAttribute(name) {
    return this._attributes.has(name);
  }
  querySelector(_selector) {
    return null;
  }
  querySelectorAll(_selector) {
    return [];
  }
  append(..._nodes) {}
  appendChild(node) {
    return node;
  }
}
var HTMLElementBase = globalThis.HTMLElement ?? SsrHTMLElement;

// dist/src/element/slot.element.js
class RouterSlot extends HTMLElementBase {
}

// dist/src/element/markdown.element.js
class MarkdownElement extends HTMLElementBase {
  static renderer = null;
  static rendererInitPromise = null;
  abortController = null;
  static setRenderer(renderer) {
    MarkdownElement.renderer = renderer;
    MarkdownElement.rendererInitPromise = renderer.init ? renderer.init() : null;
  }
  static getConfiguredRenderer() {
    return MarkdownElement.renderer;
  }
  static async getRenderer() {
    const renderer = MarkdownElement.renderer;
    if (!renderer) {
      throw new Error("No markdown renderer configured. Call MarkdownElement.setRenderer() before using <mark-down> elements.");
    }
    if (MarkdownElement.rendererInitPromise) {
      await MarkdownElement.rendererInitPromise;
    }
    return renderer;
  }
  async connectedCallback() {
    this.abortController = new AbortController;
    await this.loadContent();
  }
  disconnectedCallback() {
    this.abortController?.abort();
    this.abortController = null;
  }
  async loadContent() {
    const src = this.getAttribute("src");
    const inlineContent = this.textContent?.trim();
    if (src) {
      await this.loadFromSrc(src);
    } else if (inlineContent) {
      await this.renderContent(inlineContent);
    } else {
      this.innerHTML = "";
    }
  }
  async loadFromSrc(src) {
    const signal = this.abortController?.signal;
    try {
      const response = await fetch(src, signal ? { signal } : {});
      if (!response.ok) {
        throw new Error(`Failed to fetch ${src}: ${response.status}`);
      }
      const markdown = await response.text();
      await this.renderContent(markdown);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      this.showError(error);
    }
  }
  async renderContent(markdown) {
    try {
      const renderer = await MarkdownElement.getRenderer();
      this.innerHTML = renderer.render(markdown);
    } catch (error) {
      this.showError(error);
    }
  }
  showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.innerHTML = `<div>Markdown Error: ${escapeHtml(message)}</div>`;
  }
}

// dist/src/element/component.element.js
function filterUndefined(obj) {
  const result = {};
  let hasValue = false;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      result[k] = v;
      hasValue = true;
    }
  }
  return hasValue ? result : undefined;
}

class ComponentElement extends HTMLElementBase {
  static lazyLoaders = new Map;
  static sheetCache = new Map;
  static extendContext;
  static setContextProvider(provider) {
    ComponentElement.extendContext = provider;
  }
  static CUSTOM_STATES = ["lazy", "loading", "hydrating", "ready", "error"];
  component;
  effectiveFiles;
  params = null;
  data = null;
  context;
  state = "idle";
  errorMessage = "";
  deferred = null;
  abortController = null;
  intersectionObserver = null;
  internals;
  dataPromise = null;
  constructor(component, files) {
    super();
    this.component = component;
    this.effectiveFiles = files;
    this.internals = this.attachInternals();
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
  }
  setCustomState(next) {
    for (const s of ComponentElement.CUSTOM_STATES) {
      this.internals.states.delete(s);
    }
    this.internals.states.add(next);
  }
  static register(component, files) {
    const tagName = `widget-${component.name}`;
    if (!globalThis.customElements || customElements.get(tagName)) {
      return;
    }
    const WidgetClass = component.constructor;
    const BoundElement = class extends ComponentElement {
      constructor() {
        super(new WidgetClass, files);
      }
    };
    customElements.define(tagName, BoundElement);
  }
  static registerClass(WidgetClass, name, files) {
    const tagName = `widget-${name}`;
    if (!globalThis.customElements || customElements.get(tagName)) {
      return;
    }
    const BoundElement = class extends ComponentElement {
      constructor() {
        super(new WidgetClass, files);
      }
    };
    customElements.define(tagName, BoundElement);
  }
  static registerLazy(name, loader) {
    const tagName = `widget-${name}`;
    if (!globalThis.customElements || customElements.get(tagName))
      return;
    ComponentElement.lazyLoaders.set(tagName, loader);
    const placeholder = {
      name,
      getData: () => Promise.resolve(null),
      renderHTML: () => "",
      renderMarkdown: () => "",
      renderError: () => "",
      renderMarkdownError: () => ""
    };
    const BoundElement = class extends ComponentElement {
      constructor() {
        super(placeholder);
      }
    };
    customElements.define(tagName, BoundElement);
  }
  get ready() {
    if (this.state === "ready") {
      return Promise.resolve();
    }
    this.deferred ??= Promise.withResolvers();
    return this.deferred.promise;
  }
  async connectedCallback() {
    const tagName = this.tagName.toLowerCase();
    const lazyLoader = ComponentElement.lazyLoaders.get(tagName);
    if (lazyLoader) {
      try {
        const mod = await lazyLoader();
        if (mod.__files && typeof mod.__files === "object") {
          this.effectiveFiles = mod.__files;
        }
        for (const exp of Object.values(mod)) {
          if (exp && typeof exp === "object" && "getData" in exp) {
            const WidgetClass = exp.constructor;
            this.component = new WidgetClass;
            break;
          }
          if (typeof exp === "function" && exp.prototype?.getData) {
            this.component = new exp;
            break;
          }
        }
      } catch {
        if (this.hasAttribute(SSR_ATTR)) {
          this.removeAttribute(SSR_ATTR);
          this.signalReady();
          return;
        }
      }
    }
    this.component.element = this;
    this.abortController = new AbortController;
    const signal = this.abortController.signal;
    const params = {};
    for (const attr of this.attributes) {
      if (RESERVED_ATTRS.has(attr.name))
        continue;
      const key = attr.name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      try {
        params[key] = JSON.parse(attr.value);
      } catch {
        params[key] = attr.value;
      }
    }
    this.params = params;
    if (this.component.validateParams && this.params !== null) {
      const error = this.component.validateParams(this.params);
      if (error) {
        this.setError(error);
        return;
      }
    }
    const files = await this.loadFiles();
    if (signal.aborted)
      return;
    const currentUrl = globalThis.location ? new URL(location.href) : new URL("http://localhost/");
    const filteredFiles = filterUndefined(files);
    const base = {
      url: currentUrl,
      pathname: currentUrl.pathname,
      searchParams: currentUrl.searchParams,
      params: this.params ?? {},
      ...filteredFiles ? { files: filteredFiles } : {}
    };
    this.context = ComponentElement.extendContext ? ComponentElement.extendContext(base) : base;
    this.adoptCss();
    if (this.hasAttribute(SSR_ATTR)) {
      this.removeAttribute(SSR_ATTR);
      this.setCustomState("hydrating");
      const lightText = this.textContent?.trim();
      if (lightText) {
        try {
          this.data = JSON.parse(lightText);
        } catch {}
      }
      this.textContent = "";
      this.state = "ready";
      if (this.component.hydrate) {
        const args = { data: this.data, params: this.params, context: this.context };
        queueMicrotask(() => {
          this.component.hydrate(args);
          this.setCustomState("ready");
        });
      } else {
        this.setCustomState("ready");
      }
      this.signalReady();
      return;
    }
    if (this.hasAttribute(LAZY_ATTR)) {
      this.setCustomState("lazy");
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          this.intersectionObserver?.disconnect();
          this.intersectionObserver = null;
          this.loadData();
        }
      });
      this.intersectionObserver.observe(this);
      return;
    }
    await this.loadData();
  }
  disconnectedCallback() {
    this.component.destroy?.();
    this.component.element = undefined;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    this.abortController?.abort();
    this.abortController = null;
    this.state = "idle";
    for (const s of ComponentElement.CUSTOM_STATES) {
      this.internals.states.delete(s);
    }
    this.data = null;
    this.context = undefined;
    this.dataPromise = null;
    this.errorMessage = "";
    this.signalReady();
    this.deferred = null;
  }
  async reload() {
    if (this.params === null)
      return;
    this.abortController?.abort();
    this.abortController = new AbortController;
    await this.loadData();
  }
  async loadFiles() {
    return this.effectiveFiles ?? {};
  }
  static baseSheet = null;
  static getBaseSheet() {
    if (!ComponentElement.baseSheet) {
      ComponentElement.baseSheet = new CSSStyleSheetBase;
      ComponentElement.baseSheet.replaceSync("@layer emroute-base { :host { display: block; } :host([hidden]) { display: none; } }");
    }
    return ComponentElement.baseSheet;
  }
  adoptCss() {
    const css = this.effectiveFiles?.css;
    const base = ComponentElement.getBaseSheet();
    if (!css) {
      this.shadowRoot.adoptedStyleSheets = [base];
      return;
    }
    const name = this.component.name;
    let sheet = ComponentElement.sheetCache.get(name);
    if (!sheet) {
      sheet = new CSSStyleSheetBase;
      sheet.replaceSync(scopeWidgetCss(css, name));
      ComponentElement.sheetCache.set(name, sheet);
    }
    this.shadowRoot.adoptedStyleSheets = [base, sheet];
  }
  async loadData() {
    if (this.params === null)
      return;
    const signal = this.abortController?.signal;
    this.state = "loading";
    this.setCustomState("loading");
    this.render();
    try {
      const promise = this.component.getData({
        params: this.params,
        ...signal ? { signal } : {},
        context: this.context
      });
      this.dataPromise = promise;
      this.data = await promise;
      if (signal?.aborted)
        return;
      this.state = "ready";
      this.setCustomState("ready");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        return;
      if (signal?.aborted)
        return;
      this.setError(e instanceof Error ? e.message : String(e));
      return;
    }
    this.render();
    this.signalReady();
  }
  setError(message) {
    this.state = "error";
    this.setCustomState("error");
    this.errorMessage = message;
    this.render();
    this.signalReady();
  }
  signalReady() {
    this.deferred?.resolve();
    this.deferred = null;
  }
  render() {
    if (this.params === null) {
      this.shadowRoot.setHTMLUnsafe("");
      return;
    }
    if (this.state === "error") {
      this.shadowRoot.setHTMLUnsafe(this.component.renderError({
        error: new Error(this.errorMessage),
        params: this.params
      }));
      return;
    }
    this.shadowRoot.setHTMLUnsafe(this.component.renderHTML({
      data: this.state === "ready" ? this.data : null,
      params: this.params,
      context: this.context
    }));
    if (this.state === "ready" && this.component.hydrate) {
      const args = { data: this.data, params: this.params, context: this.context };
      queueMicrotask(() => {
        this.component.hydrate(args);
      });
    }
  }
}

// dist/core/router/route.trie.js
class RouteTrie {
  tree;
  constructor(tree) {
    this.tree = tree;
  }
  match(pathname) {
    pathname = this.normalizePath(pathname);
    if (pathname === "/") {
      if (this.tree.files || this.tree.redirect) {
        return { node: this.tree, pattern: "/", params: {} };
      }
      return;
    }
    return this.walk(this.tree, this.splitSegments(pathname), 0, {}, "/");
  }
  findErrorBoundary(pathname) {
    pathname = this.normalizePath(pathname);
    if (pathname === "/")
      return this.tree.errorBoundary;
    return this.walkForBoundary(this.tree, this.splitSegments(pathname), 0, this.tree.errorBoundary);
  }
  findRoute(pattern) {
    if (pattern === "/") {
      return this.tree.files || this.tree.redirect ? this.tree : undefined;
    }
    const segments = this.splitSegments(pattern);
    let node = this.tree;
    for (const segment of segments) {
      let child;
      if (segment.startsWith(":") && segment.endsWith("*")) {
        child = node.wildcard?.child;
      } else if (segment.startsWith(":")) {
        child = node.dynamic?.child;
      } else {
        child = node.children?.[segment];
      }
      if (!child)
        return;
      node = child;
    }
    return node.files || node.redirect ? node : undefined;
  }
  safeDecode(segment) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }
  splitSegments(pathname) {
    return pathname.substring(1).split("/");
  }
  normalizePath(pathname) {
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    if (!pathname.startsWith("/")) {
      pathname = "/" + pathname;
    }
    return pathname;
  }
  walk(node, segments, index, params, pattern) {
    if (index === segments.length) {
      if (node.files || node.redirect) {
        return { node, pattern, params: { ...params } };
      }
      if (node.wildcard && (node.wildcard.child.files || node.wildcard.child.redirect)) {
        const wp = pattern === "/" ? `/:${node.wildcard.param}*` : `${pattern}/:${node.wildcard.param}*`;
        return {
          node: node.wildcard.child,
          pattern: wp,
          params: { ...params, [node.wildcard.param]: "" }
        };
      }
      return;
    }
    const segment = segments[index];
    const staticChild = node.children?.[segment];
    if (staticChild) {
      const childPattern = pattern === "/" ? `/${segment}` : `${pattern}/${segment}`;
      const result = this.walk(staticChild, segments, index + 1, params, childPattern);
      if (result)
        return result;
    }
    if (node.dynamic) {
      const { param, child } = node.dynamic;
      params[param] = this.safeDecode(segment);
      const childPattern = pattern === "/" ? `/:${param}` : `${pattern}/:${param}`;
      const result = this.walk(child, segments, index + 1, params, childPattern);
      if (result)
        return result;
      delete params[param];
    }
    if (node.wildcard && (node.wildcard.child.files || node.wildcard.child.redirect)) {
      const { param, child } = node.wildcard;
      let rest = this.safeDecode(segment);
      for (let i = index + 1;i < segments.length; i++) {
        rest += "/" + this.safeDecode(segments[i]);
      }
      const wp = pattern === "/" ? `/:${param}*` : `${pattern}/:${param}*`;
      return {
        node: child,
        pattern: wp,
        params: { ...params, [param]: rest }
      };
    }
    return;
  }
  walkForBoundary(node, segments, index, deepest) {
    if (index === segments.length) {
      return node.errorBoundary ?? deepest;
    }
    const segment = segments[index];
    const staticChild = node.children?.[segment];
    if (staticChild) {
      return this.walkForBoundary(staticChild, segments, index + 1, staticChild.errorBoundary ?? deepest);
    }
    if (node.dynamic) {
      return this.walkForBoundary(node.dynamic.child, segments, index + 1, node.dynamic.child.errorBoundary ?? deepest);
    }
    if (node.wildcard) {
      return node.wildcard.child.errorBoundary ?? deepest;
    }
    return deepest;
  }
}

// dist/core/runtime/abstract.runtime.js
var ROUTES_MANIFEST_PATH = "/routes.manifest.json";
var WIDGETS_MANIFEST_PATH = "/widgets.manifest.json";
var ELEMENTS_MANIFEST_PATH = "/elements.manifest.json";

// dist/core/type/logger.type.js
var noop = () => {};
var defaultLogger = { error: noop, warn: noop };
function setLogger(_logger) {
  console.warn("[emroute] setLogger() is deprecated. Pass `logger` in Emroute.create() config instead.");
}

// dist/core/pipeline/pipeline.js
var DEFAULT_ROOT_ROUTE = {
  pattern: "/",
  type: "page",
  modulePath: "__default_root__"
};
function toRouteConfig(node, pattern) {
  return {
    pattern,
    type: node.redirect ? "redirect" : "page",
    modulePath: node.redirect ?? node.files?.ts ?? node.files?.js ?? node.files?.html ?? node.files?.md ?? "",
    ...node.files ? { files: node.files } : {}
  };
}

class Pipeline {
  runtime;
  contextProvider;
  logger;
  moduleLoaders;
  constructor(options) {
    this.runtime = options.runtime;
    this.contextProvider = options.contextProvider;
    this.logger = options.logger ?? defaultLogger;
    this.moduleLoaders = options.moduleLoaders ?? {};
  }
  async getResolver() {
    const response = await this.runtime.query(ROUTES_MANIFEST_PATH);
    const tree = response.status === 404 ? {} : await response.json();
    return new RouteTrie(tree);
  }
  async match(url) {
    const resolver = await this.getResolver();
    const resolved = resolver.match(url.pathname);
    if (resolved) {
      return { route: toRouteConfig(resolved.node, resolved.pattern), params: resolved.params };
    }
    if (url.pathname === "/" || url.pathname === "") {
      return { route: DEFAULT_ROOT_ROUTE, params: {} };
    }
    return;
  }
  async findRoute(pattern) {
    const resolver = await this.getResolver();
    const node = resolver.findRoute(pattern);
    if (!node)
      return;
    return toRouteConfig(node, pattern);
  }
  async findErrorBoundary(pathname) {
    const resolver = await this.getResolver();
    const modulePath = resolver.findErrorBoundary(pathname);
    if (!modulePath)
      return;
    return { pattern: pathname, modulePath };
  }
  async getStatusPage(status) {
    const resolver = await this.getResolver();
    const node = resolver.findRoute(`/${status}`);
    if (!node)
      return;
    return toRouteConfig(node, `/${status}`);
  }
  async getErrorHandler() {
    const resolver = await this.getResolver();
    const modulePath = resolver.findErrorBoundary("/");
    if (!modulePath)
      return;
    return { pattern: "/", type: "error", modulePath };
  }
  buildRouteHierarchy(pattern) {
    if (pattern === "/")
      return ["/"];
    const segments = pattern.split("/").filter(Boolean);
    const hierarchy = ["/"];
    let current = "";
    for (const segment of segments) {
      current += "/" + segment;
      hierarchy.push(current);
    }
    return hierarchy;
  }
  async findWidgetModulePath(name) {
    return (await this.findWidgetEntry(name))?.modulePath;
  }
  async findWidgetEntry(name) {
    const response = await this.runtime.query(WIDGETS_MANIFEST_PATH);
    if (response.status === 404)
      return;
    const entries = await response.json();
    return entries.find((e) => e.name === name);
  }
  async loadWidgetModule(name) {
    const entry = await this.findWidgetEntry(name);
    if (!entry)
      return;
    const mod = await this.loadModule(entry.modulePath);
    const component = this.extractWidgetComponent(mod);
    if (!component)
      return;
    const inlined = this.getModuleFiles(mod);
    const files = inlined ?? (entry.files ? await this.loadFiles(entry.files) : {});
    return { component, files };
  }
  async loadWidget(name) {
    return (await this.loadWidgetModule(name))?.component;
  }
  extractWidgetComponent(mod) {
    for (const value of Object.values(mod)) {
      if (!value)
        continue;
      if (typeof value === "object" && "getData" in value) {
        return value;
      }
      if (typeof value === "function" && value.prototype?.getData) {
        return new value;
      }
    }
    return;
  }
  async loadModule(modulePath) {
    const loader = this.moduleLoaders[modulePath];
    if (loader) {
      return await loader();
    }
    const abs = modulePath.startsWith("/") ? modulePath : "/" + modulePath;
    return await this.runtime.loadModule(abs);
  }
  getModuleFiles(mod) {
    if (!mod || typeof mod !== "object")
      return;
    const files = mod.__files;
    if (!files || typeof files !== "object")
      return;
    return files;
  }
  async loadFiles(files) {
    const load = async (path) => {
      const abs = path.startsWith("/") ? path : "/" + path;
      try {
        return await this.runtime.query(abs, { as: "text" });
      } catch (e) {
        console.warn(`[Pipeline] Failed to load file ${path}:`, e instanceof Error ? e.message : e);
        return;
      }
    };
    const [html, md, css] = await Promise.all([
      files.html ? load(files.html) : undefined,
      files.md ? load(files.md) : undefined,
      files.css ? load(files.css) : undefined
    ]);
    const result = {};
    if (html !== undefined)
      result.html = html;
    if (md !== undefined)
      result.md = md;
    if (css !== undefined)
      result.css = css;
    return result;
  }
  toRouteInfo(matched, url) {
    return { url, params: matched.params };
  }
  async buildContext(routeInfo, route, signal, isLeaf, loadedModule) {
    const rf = route.files;
    const inlined = loadedModule ? this.getModuleFiles(loadedModule) : undefined;
    let files;
    if (inlined) {
      files = inlined;
    } else if (rf) {
      const filePaths = {};
      if (rf.html)
        filePaths.html = rf.html;
      if (rf.md)
        filePaths.md = rf.md;
      if (rf.css)
        filePaths.css = rf.css;
      files = await this.loadFiles(filePaths);
    } else {
      files = {};
    }
    const base = {
      ...routeInfo,
      pathname: routeInfo.url.pathname,
      searchParams: routeInfo.url.searchParams,
      files,
      ...signal ? { signal } : {},
      ...isLeaf !== undefined ? { isLeaf } : {}
    };
    return this.contextProvider ? this.contextProvider(base) : base;
  }
}

// dist/core/util/widget-resolve.util.js
var MAX_WIDGET_DEPTH = 10;
async function resolveRecursively(content, parse, resolve, replace, depth = 0, logger = defaultLogger) {
  if (depth >= MAX_WIDGET_DEPTH) {
    logger.warn(`Widget nesting depth limit reached (${MAX_WIDGET_DEPTH}). ` + "Possible circular dependency or excessive nesting.");
    return content;
  }
  const widgets = parse(content);
  if (widgets.length === 0)
    return content;
  const replacements = new Map;
  await Promise.all(widgets.map(async (widget) => {
    let rendered = await resolve(widget);
    rendered = await resolveRecursively(rendered, parse, resolve, replace, depth + 1, logger);
    replacements.set(widget, rendered);
  }));
  return replace(content, replacements);
}
function resolveWidgetTags(html, getWidget, routeInfo, contextProvider, logger = defaultLogger) {
  const tagPattern = /<widget-(?<name>[a-z][a-z0-9-]*)(?<attrs>\s[^>]*)?>(?<content>.*?)<\/widget-\k<name>>/gis;
  const wrappers = new Map;
  const ssrAttrPattern = new RegExp(`\\s${SSR_ATTR}(?:\\s|=|$)`);
  const parse = (content) => {
    const matches = content.matchAll(tagPattern).toArray();
    return matches.filter((match) => {
      const attrsString = match.groups.attrs || "";
      return !ssrAttrPattern.test(attrsString);
    });
  };
  const resolve = async (match) => {
    const widgetName = match.groups.name;
    const attrsString = match.groups.attrs?.trim() ?? "";
    try {
      const result = await getWidget(widgetName);
      if (!result)
        return match[0];
      const { component: widget, files } = result;
      const params = parseAttrsToParams(attrsString);
      const baseContext = {
        ...routeInfo,
        pathname: routeInfo.url.pathname,
        searchParams: routeInfo.url.searchParams,
        ...files ? { files } : {}
      };
      const context = contextProvider ? contextProvider(baseContext) : baseContext;
      const data = await widget.getData({ params, context });
      const hostStyle = "<style>@layer emroute-base { :host { display: block; } :host([hidden]) { display: none; } }</style>";
      const cssStyle = files?.css ? `<style>${scopeWidgetCss(files.css, widgetName)}</style>` : "";
      const rendered = hostStyle + cssStyle + widget.renderHTML({ data, params, context });
      wrappers.set(match, {
        tagName: `widget-${widgetName}`,
        attrs: attrsString ? ` ${attrsString}` : "",
        ssrData: widget.exposeSsrData ? escapeAttr(JSON.stringify(data)) : ""
      });
      return rendered;
    } catch (e) {
      logger.error(`[SSR HTML] Widget "${widgetName}" render failed`, e instanceof Error ? e : undefined);
      return match[0];
    }
  };
  const replace = (content, replacements) => {
    let result = content;
    const entries = [...replacements.entries()].sort((a, b) => b[0].index - a[0].index);
    for (const [match, innerHtml] of entries) {
      const start = match.index;
      const end = start + match[0].length;
      const wrap = wrappers.get(match);
      const lightDomData = wrap?.ssrData ? wrap.ssrData : "";
      const replacement = wrap ? `<${wrap.tagName}${wrap.attrs} ${SSR_ATTR}><template shadowrootmode="open">${innerHtml}</template>${lightDomData}</${wrap.tagName}>` : innerHtml;
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  };
  return resolveRecursively(html, parse, resolve, replace, 0, logger);
}
function parseAttrsToParams(attrsString) {
  const params = {};
  if (!attrsString)
    return params;
  const attrPattern = /(?<attr>[a-z][a-z0-9-]*)(?:="(?<dq>[^"]*)"|='(?<sq>[^']*)'|=(?<uq>[^\s>]+))?/gi;
  for (const match of attrsString.matchAll(attrPattern)) {
    const { attr: attrName, dq, sq, uq } = match.groups;
    if (!attrName || RESERVED_ATTRS.has(attrName))
      continue;
    const key = attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const rawValue = dq ?? sq ?? uq;
    if (rawValue === undefined) {
      params[key] = "";
      continue;
    }
    const raw = rawValue.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"');
    try {
      params[key] = JSON.parse(raw);
    } catch {
      params[key] = raw;
    }
  }
  return params;
}
function escapeAttr(value) {
  return value.replaceAll("&", "&amp;").replaceAll("'", "&#39;");
}

// dist/core/component/abstract.component.js
class Component {
  element;
  files;
  exposeSsrData;
  getData(_args) {
    return Promise.resolve(null);
  }
  renderHTML(args) {
    if (args.data === null) {
      return `<div data-component="${this.name}">Loading...</div>`;
    }
    const markdown = this.renderMarkdown({
      data: args.data,
      params: args.params,
      context: args.context
    });
    return `<div data-component="${this.name}" data-markdown>${escapeHtml(markdown)}</div>`;
  }
  experimentalUseTemplate(sourceOrId, id) {
    if (id === undefined) {
      const templateId = sourceOrId;
      const shadowRoot = this.element?.shadowRoot;
      const template = shadowRoot?.querySelector(`template#${templateId}`);
      if (!template) {
        throw new Error(`[${this.name}] Template "#${templateId}" not found in shadow DOM. ` + "Ensure the <template> element exists in the companion HTML.");
      }
      return (slots) => {
        const clone = template.content.cloneNode(true);
        if (!slots)
          return clone;
        for (const [name, content] of Object.entries(slots)) {
          const selector = name === "default" ? "slot:not([name])" : `slot[name="${name}"]`;
          const slot = clone.querySelector(selector);
          if (!slot)
            continue;
          const temp = document.createElement("template");
          temp.innerHTML = content;
          slot.replaceWith(temp.content);
        }
        return clone;
      };
    }
    const source = sourceOrId;
    const mdPattern = new RegExp("```template:" + id + "\\n([\\s\\S]*?)```");
    const mdMatch = source.match(mdPattern);
    if (mdMatch) {
      const skeleton2 = mdMatch[1];
      return (slots) => {
        if (!slots)
          return skeleton2;
        let result = skeleton2;
        for (const [name, content] of Object.entries(slots)) {
          result = result.replaceAll(`slot:${name}`, content);
        }
        return result;
      };
    }
    const htmlPattern = new RegExp(`<template\\s+id=["']${id}["'][^>]*>([\\s\\S]*?)</template>`);
    const htmlMatch = source.match(htmlPattern);
    if (!htmlMatch) {
      throw new Error(`[${this.name}] Template "${id}" not found in source. ` + 'Expected <template id="' + id + '"> in HTML or ```template:' + id + " in markdown.");
    }
    const skeleton = htmlMatch[1];
    return (slots) => {
      if (!slots)
        return skeleton;
      let result = skeleton;
      for (const [name, content] of Object.entries(slots)) {
        if (name === "default")
          continue;
        result = result.replaceAll(new RegExp(`<slot\\s+name=["']${name}["'][^>]*>[\\s\\S]*?</slot>`, "g"), content);
      }
      if ("default" in slots) {
        result = result.replaceAll(/<slot\s*>[\s\S]*?<\/slot>/g, slots["default"]);
      }
      return result;
    };
  }
  renderError(args) {
    const msg = args.error instanceof Error ? args.error.message : String(args.error);
    return `<div data-component="${this.name}">Error: ${escapeHtml(msg)}</div>`;
  }
  renderMarkdownError(error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `> **Error** (\`${this.name}\`): ${msg}`;
  }
}

// dist/core/component/page.component.js
class PageComponent extends Component {
  name = "page";
  pattern;
  renderHTML(args) {
    const files = args.context.files;
    const style = files?.css ? `<style>${files.css}</style>
` : "";
    if (files?.html) {
      let html = style + files.html;
      if (files.md && html.includes("<mark-down></mark-down>")) {
        html = html.replace("<mark-down></mark-down>", `<mark-down>${escapeHtml(files.md)}</mark-down>`);
      }
      return html;
    }
    if (files?.md) {
      const hasSlot = files.md.includes("```router-slot");
      const slot = args.context.isLeaf || hasSlot ? "" : `
<router-slot></router-slot>`;
      return `${style}<mark-down>${escapeHtml(files.md)}</mark-down>${slot}`;
    }
    return args.context.isLeaf ? "" : "<router-slot></router-slot>";
  }
  renderMarkdown(args) {
    const files = args.context.files;
    if (files?.md) {
      return files.md;
    }
    return args.context.isLeaf ? "" : "```router-slot\n```";
  }
  getTitle(_args) {
    return;
  }
}
var page_component_default = new PageComponent;

// dist/core/renderer/ssr.renderer.js
class SsrRenderer {
  pipeline;
  logger;
  constructor(pipeline, _options = {}) {
    this.pipeline = pipeline;
    this.logger = pipeline.logger;
  }
  async render(url, signal) {
    const matched = await this.pipeline.match(url);
    if (!matched) {
      const statusPage = await this.pipeline.getStatusPage(404);
      if (statusPage) {
        try {
          const ri = { url, params: {} };
          const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
          return { content: this.stripSlots(result.content), status: 404, ...result.title !== undefined ? { title: result.title } : {} };
        } catch (e) {
          this.logger.error(`[${this.label}] Failed to render 404 status page for ${url.pathname}`, e instanceof Error ? e : undefined);
        }
      }
      return { content: this.renderStatusPage(404, url), status: 404 };
    }
    if (matched.route.type === "redirect") {
      const module = await this.pipeline.loadModule(matched.route.modulePath);
      const redirectConfig = module.default;
      assertSafeRedirect(redirectConfig.to);
      return {
        content: this.renderRedirect(redirectConfig.to),
        status: redirectConfig.status ?? 301,
        redirect: redirectConfig.to
      };
    }
    const routeInfo = this.pipeline.toRouteInfo(matched, url);
    try {
      const { content, title } = await this.renderPage(routeInfo, matched, signal);
      return { content, status: 200, ...title !== undefined ? { title } : {} };
    } catch (error) {
      if (error instanceof Response) {
        const statusPage = await this.pipeline.getStatusPage(error.status);
        if (statusPage) {
          try {
            const ri = { url, params: {} };
            const result = await this.renderRouteContent(ri, statusPage, undefined, signal);
            return {
              content: this.stripSlots(result.content),
              status: error.status,
              ...result.title !== undefined ? { title: result.title } : {}
            };
          } catch (e) {
            this.logger.error(`[${this.label}] Failed to render ${error.status} status page for ${url.pathname}`, e instanceof Error ? e : undefined);
          }
        }
        return { content: this.renderStatusPage(error.status, url), status: error.status };
      }
      this.logger.error(`[${this.label}] Error rendering ${url.pathname}:`, error instanceof Error ? error : undefined);
      const boundary = await this.pipeline.findErrorBoundary(url.pathname);
      if (boundary) {
        const result = await this.tryRenderErrorModule(boundary.modulePath, url, "boundary");
        if (result)
          return result;
      }
      const errorHandler = await this.pipeline.getErrorHandler();
      if (errorHandler) {
        const result = await this.tryRenderErrorModule(errorHandler.modulePath, url, "handler");
        if (result)
          return result;
      }
      return { content: this.renderErrorPage(error, url), status: 500 };
    }
  }
  async renderPage(routeInfo, matched, signal) {
    const hierarchy = this.pipeline.buildRouteHierarchy(matched.route.pattern);
    const segments = [];
    for (let i = 0;i < hierarchy.length; i++) {
      const routePattern = hierarchy[i];
      let route = await this.pipeline.findRoute(routePattern);
      if (!route && routePattern === "/") {
        route = DEFAULT_ROOT_ROUTE;
      }
      if (!route)
        continue;
      if (route === matched.route && routePattern !== matched.route.pattern)
        continue;
      segments.push({ route, isLeaf: i === hierarchy.length - 1 });
    }
    const results = await Promise.all(segments.map(({ route, isLeaf }) => this.renderRouteContent(routeInfo, route, isLeaf, signal)));
    let result = "";
    let pageTitle;
    let lastRenderedPattern = "";
    for (let i = 0;i < segments.length; i++) {
      const { content, title } = results[i];
      if (title) {
        pageTitle = title;
      }
      if (result === "") {
        result = content;
      } else {
        const injected = this.injectSlot(result, content, lastRenderedPattern);
        if (injected === result) {
          this.logger.warn(`[${this.label}] Route "${lastRenderedPattern}" has no <router-slot> ` + `for child route "${hierarchy[i]}" to render into. ` + `Add <router-slot></router-slot> to the parent template.`);
        }
        result = injected;
      }
      lastRenderedPattern = segments[i].route.pattern;
    }
    result = this.stripSlots(result);
    return { content: result, ...pageTitle !== undefined ? { title: pageTitle } : {} };
  }
  async loadRouteContent(routeInfo, route, isLeaf, signal) {
    const files = route.files ?? {};
    const tsModule = files.ts ?? files.js;
    const loadedModule = tsModule ? await this.pipeline.loadModule(tsModule) : undefined;
    const component = loadedModule?.default ?? page_component_default;
    const context = await this.pipeline.buildContext(routeInfo, route, signal, isLeaf, loadedModule);
    const data = await component.getData({ params: routeInfo.params, ...signal ? { signal } : {}, context });
    const content = this.renderContent(component, { data, params: routeInfo.params, context });
    const title = component.getTitle({ data, params: routeInfo.params, context });
    return { content, ...title !== undefined ? { title } : {} };
  }
  renderComponent(component, data, context) {
    return this.renderContent(component, { data, params: {}, context });
  }
  static EMPTY_URL = new URL("http://error");
  async tryRenderErrorModule(modulePath, url, kind) {
    try {
      const module = await this.pipeline.loadModule(modulePath);
      const component = module.default;
      const minCtx = {
        url: SsrRenderer.EMPTY_URL,
        params: {},
        pathname: "",
        searchParams: new URLSearchParams
      };
      const data = await component.getData({ params: {}, context: minCtx });
      const content = this.renderComponent(component, data, minCtx);
      return { content, status: 500 };
    } catch (e) {
      this.logger.error(`[${this.label}] Error ${kind} failed for ${url.pathname}`, e instanceof Error ? e : undefined);
      return null;
    }
  }
}

// dist/core/renderer/html.renderer.js
class SsrHtmlRenderer extends SsrRenderer {
  label = "SSR HTML";
  markdownRenderer;
  markdownReady = null;
  constructor(pipeline, options = {}) {
    super(pipeline, options);
    this.markdownRenderer = options.markdownRenderer ?? null;
    if (this.markdownRenderer?.init) {
      this.markdownReady = this.markdownRenderer.init();
    }
  }
  injectSlot(parent, child, parentPattern) {
    const escaped = parentPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return parent.replace(new RegExp(`<router-slot\\b[^>]*\\bpattern="${escaped}"[^>]*></router-slot>`), child);
  }
  stripSlots(result) {
    return result.replace(/<router-slot[^>]*><\/router-slot>/g, "");
  }
  async renderRouteContent(routeInfo, route, isLeaf, signal) {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { content: `<router-slot pattern="${route.pattern}"></router-slot>` };
    }
    const { content: rawContent, title } = await this.loadRouteContent(routeInfo, route, isLeaf, signal);
    let content = rawContent;
    content = await this.expandMarkdown(content);
    content = this.attributeSlots(content, route.pattern);
    const widgetCache = new Map;
    content = await resolveWidgetTags(content, (name) => {
      if (!widgetCache.has(name)) {
        widgetCache.set(name, this.pipeline.loadWidgetModule(name).catch((e) => {
          this.logger.error(`[${this.label}] Failed to load widget "${name}"`, e instanceof Error ? e : undefined);
          return;
        }));
      }
      return widgetCache.get(name);
    }, routeInfo, this.pipeline.contextProvider, this.logger);
    return { content, ...title !== undefined ? { title } : {} };
  }
  renderContent(component, args) {
    return component.renderHTML(args);
  }
  renderRedirect(to) {
    return `<meta http-equiv="refresh" content="0;url=${escapeHtml(to)}">`;
  }
  renderStatusPage(status, url) {
    return `
      <h1>${STATUS_MESSAGES[status] ?? "Error"}</h1>
      <p>Path: ${escapeHtml(url.pathname)}</p>
    `;
  }
  renderErrorPage(error, url) {
    const message = error instanceof Error ? error.message : String(error);
    return `
      <h1>Error</h1>
      <p>Path: ${escapeHtml(url.pathname)}</p>
      <p>${escapeHtml(message)}</p>
    `;
  }
  attributeSlots(content, routePattern) {
    return content.replace(/<router-slot(?![^>]*\bpattern=)([^>]*)><\/router-slot>/g, `<router-slot pattern="${routePattern}"$1></router-slot>`);
  }
  async expandMarkdown(content) {
    if (!this.markdownRenderer)
      return content;
    if (!content.includes("<mark-down>"))
      return content;
    if (this.markdownReady) {
      await this.markdownReady;
    }
    const renderer = this.markdownRenderer;
    const pattern = /<mark-down>([\s\S]*?)<\/mark-down>/g;
    return content.replace(pattern, (_match, escaped) => {
      const markdown = unescapeHtml(escaped);
      return renderer.render(markdown);
    });
  }
}

// dist/core/widget/widget.parser.js
var WIDGET_PATTERN = /```widget:(?<name>[a-z][a-z0-9-]*)\n(?<params>.*?)```/gs;
function parseWidgetBlocks(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(WIDGET_PATTERN)) {
    const fullMatch = match[0];
    const { name: widgetName, params: paramsRaw } = match.groups;
    const paramsJson = paramsRaw.trim();
    const startIndex = match.index;
    const block = {
      fullMatch,
      widgetName,
      params: null,
      startIndex,
      endIndex: startIndex + fullMatch.length
    };
    if (paramsJson) {
      try {
        const parsed = JSON.parse(paramsJson);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          block.params = parsed;
        } else {
          block.parseError = "Params must be a JSON object";
        }
      } catch (e) {
        block.parseError = `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      block.params = {};
    }
    blocks.push(block);
  }
  return blocks;
}
function replaceWidgetBlocks(markdown, replacements) {
  const sortedBlocks = [...replacements.entries()].sort(([a], [b]) => b.startIndex - a.startIndex);
  let result = markdown;
  for (const [block, replacement] of sortedBlocks) {
    result = result.slice(0, block.startIndex) + replacement + result.slice(block.endIndex);
  }
  return result;
}

// dist/core/renderer/md.renderer.js
var BARE_SLOT_BLOCK = "```router-slot\n```";
function routerSlotBlock(pattern) {
  return `\`\`\`router-slot
{"pattern":"${pattern}"}
\`\`\``;
}

class SsrMdRenderer extends SsrRenderer {
  label = "SSR MD";
  constructor(pipeline, options = {}) {
    super(pipeline, options);
  }
  injectSlot(parent, child, parentPattern) {
    return parent.replace(routerSlotBlock(parentPattern), child);
  }
  stripSlots(result) {
    return result.replace(/```router-slot\n(?:\{[^}]*\}\n)?```/g, "").trim();
  }
  async renderRouteContent(routeInfo, route, isLeaf, signal) {
    if (route.modulePath === DEFAULT_ROOT_ROUTE.modulePath) {
      return { content: routerSlotBlock(route.pattern) };
    }
    const { content: rawContent, title } = await this.loadRouteContent(routeInfo, route, isLeaf, signal);
    let content = rawContent;
    content = content.replaceAll(BARE_SLOT_BLOCK, routerSlotBlock(route.pattern));
    content = await this.resolveWidgets(content, routeInfo);
    return { content, ...title !== undefined ? { title } : {} };
  }
  renderContent(component, args) {
    return component.renderMarkdown(args);
  }
  renderRedirect(to) {
    return `Redirect to: ${to}`;
  }
  renderStatusPage(status, url) {
    return `# ${STATUS_MESSAGES[status] ?? "Error"}

Path: \`${url.pathname}\``;
  }
  renderErrorPage(_error, url) {
    return `# Internal Server Error

Path: \`${url.pathname}\``;
  }
  resolveWidgets(content, routeInfo) {
    const widgetCache = new Map;
    const loadWidget = (name) => {
      if (!widgetCache.has(name)) {
        widgetCache.set(name, this.pipeline.loadWidgetModule(name).catch((e) => {
          this.logger.error(`[${this.label}] Failed to load widget "${name}"`, e instanceof Error ? e : undefined);
          return;
        }));
      }
      return widgetCache.get(name);
    };
    return resolveRecursively(content, parseWidgetBlocks, async (block) => {
      if (block.parseError || !block.params) {
        return `> **Error** (\`${block.widgetName}\`): ${block.parseError}`;
      }
      const result = await loadWidget(block.widgetName);
      if (!result) {
        return `> **Error**: Unknown widget \`${block.widgetName}\``;
      }
      const { component: widget, files } = result;
      try {
        const baseContext = {
          ...routeInfo,
          pathname: routeInfo.url.pathname,
          searchParams: routeInfo.url.searchParams,
          ...files ? { files } : {}
        };
        const context = this.pipeline.contextProvider ? this.pipeline.contextProvider(baseContext) : baseContext;
        const data = await widget.getData({ params: block.params, context });
        return widget.renderMarkdown({ data, params: block.params, context });
      } catch (e) {
        return widget.renderMarkdownError(e);
      }
    }, replaceWidgetBlocks, 0, this.logger);
  }
}

// dist/core/util/md.util.js
function rewriteMdLinks(markdown, base, skipPrefixes) {
  const prefix = base + "/";
  const skip = skipPrefixes.map((p) => p.slice(1) + "/").join("|");
  const inlineRe = new RegExp(`\\]\\(\\/(?!${skip})`, "g");
  const refRe = new RegExp(`^(\\[[^\\]]+\\]:\\s+)\\/(?!${skip})`, "g");
  const lines = markdown.split(`
`);
  let inCodeBlock = false;
  for (let i = 0;i < lines.length; i++) {
    if (lines[i].startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock)
      continue;
    lines[i] = lines[i].replaceAll(inlineRe, `](${prefix}`);
    lines[i] = lines[i].replaceAll(refRe, `$1${prefix}`);
  }
  return lines.join(`
`);
}

// dist/core/server/emroute.server.js
var DEFAULT_BASE_PATH = { html: "/html", md: "/md", app: "/app" };

class Emroute {
  runtime;
  htmlBase;
  mdBase;
  appBase;
  spa;
  title;
  htmlRenderer;
  mdRenderer;
  shell;
  constructor(htmlRenderer, mdRenderer, shell, runtime, htmlBase, mdBase, appBase, spa, title) {
    this.runtime = runtime;
    this.htmlBase = htmlBase;
    this.mdBase = mdBase;
    this.appBase = appBase;
    this.spa = spa;
    this.title = title;
    this.htmlRenderer = htmlRenderer;
    this.mdRenderer = mdRenderer;
    this.shell = shell;
  }
  static async create(config, runtime) {
    const { spa = "root" } = config;
    const { html: htmlBase, md: mdBase, app: appBase } = config.basePath ?? DEFAULT_BASE_PATH;
    if (!config.routeTree) {
      const manifestResponse = await runtime.query(ROUTES_MANIFEST_PATH);
      if (manifestResponse.status === 404) {
        throw new Error(`[emroute] ${ROUTES_MANIFEST_PATH} not found in runtime. ` + "Provide routeTree in config or ensure the runtime produces it.");
      }
    }
    const pipeline = new Pipeline({
      runtime,
      ...config.extendContext ? { contextProvider: config.extendContext } : {},
      ...config.moduleLoaders ? { moduleLoaders: config.moduleLoaders } : {}
    });
    let ssrHtmlRenderer = null;
    let ssrMdRenderer = null;
    if (spa !== "only") {
      ssrHtmlRenderer = new SsrHtmlRenderer(pipeline, {
        ...config.markdownRenderer ? { markdownRenderer: config.markdownRenderer } : {}
      });
      ssrMdRenderer = new SsrMdRenderer(pipeline);
    }
    const title = config.title ?? "emroute";
    const fullBasePath = config.basePath ?? DEFAULT_BASE_PATH;
    const shell = config.shell ? await config.shell({ runtime, spa, basePath: fullBasePath, title }) : await Emroute.resolveShell(runtime, title, spa === "root" || spa === "only" ? appBase : htmlBase, spa);
    return new Emroute(ssrHtmlRenderer, ssrMdRenderer, shell, runtime, htmlBase, mdBase, appBase, spa, title);
  }
  async handleRequest(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const mdPrefix = this.mdBase + "/";
    const htmlPrefix = this.htmlBase + "/";
    const appPrefix = this.appBase + "/";
    if (this.mdRenderer && (pathname.startsWith(mdPrefix) || pathname === this.mdBase)) {
      const routePath = pathname === this.mdBase ? "/" : pathname.slice(this.mdBase.length);
      if (routePath.length > 1 && routePath.endsWith("/")) {
        const canonical = this.mdBase + routePath.slice(0, -1) + (url.search || "");
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const { content, status, redirect } = await this.mdRenderer.render(routeUrl, req.signal);
        if (redirect) {
          const target = redirect.startsWith("/") ? this.mdBase + redirect : redirect;
          return Response.redirect(new URL(target, url.origin), status);
        }
        return new Response(rewriteMdLinks(content, this.mdBase, [this.mdBase, this.htmlBase]), {
          status,
          headers: { "Content-Type": "text/markdown; charset=utf-8; variant=CommonMark" }
        });
      } catch (e) {
        console.error(`[emroute] Error rendering ${pathname}:`, e);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
    if (this.htmlRenderer && (pathname.startsWith(htmlPrefix) || pathname === this.htmlBase)) {
      const routePath = pathname === this.htmlBase ? "/" : pathname.slice(this.htmlBase.length);
      if (routePath.length > 1 && routePath.endsWith("/")) {
        const canonical = this.htmlBase + routePath.slice(0, -1) + (url.search || "");
        return Response.redirect(new URL(canonical, url.origin), 301);
      }
      try {
        const routeUrl = new URL(routePath + url.search, url.origin);
        const result = await this.htmlRenderer.render(routeUrl, req.signal);
        if (result.redirect) {
          const target = result.redirect.startsWith("/") ? this.htmlBase + result.redirect : result.redirect;
          return Response.redirect(new URL(target, url.origin), result.status);
        }
        const ssrTitle = result.title ?? this.title;
        const html = Emroute.injectSsrContent(this.shell, result.content, ssrTitle, pathname);
        return new Response(html, {
          status: result.status,
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      } catch (e) {
        console.error(`[emroute] Error rendering ${pathname}:`, e);
        return new Response("Internal Server Error", { status: 500 });
      }
    }
    if (pathname.startsWith(appPrefix) || pathname === this.appBase) {
      return new Response(this.shell, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (pathname.startsWith(htmlPrefix) || pathname === this.htmlBase || pathname.startsWith(mdPrefix) || pathname === this.mdBase) {
      const routePath = pathname.startsWith(htmlPrefix) ? pathname.slice(this.htmlBase.length) : pathname.startsWith(mdPrefix) ? pathname.slice(this.mdBase.length) : "/";
      return Response.redirect(new URL(this.appBase + routePath + (url.search || ""), url.origin), 302);
    }
    const lastSegment = pathname.split("/").pop() ?? "";
    if (lastSegment.includes(".")) {
      const fileResponse = await this.runtime.handle(pathname);
      if (fileResponse.status === 200)
        return fileResponse;
      return null;
    }
    const base = this.spa === "root" || this.spa === "only" ? this.appBase : this.htmlBase;
    const bare = pathname === "/" ? "" : pathname.slice(1).replace(/\/$/, "");
    return Response.redirect(new URL(`${base}/${bare}`, url.origin), 302);
  }
  static async buildHtmlShell(runtime, title, basePath, spa) {
    const baseTag = basePath ? `
  <base href="${escapeHtml(basePath)}/">` : "";
    let manifestTag = "";
    if ((await runtime.query("/manifest.json")).status !== 404) {
      manifestTag = `
  <link rel="manifest" href="/manifest.json">`;
    }
    let cssTag = "";
    if ((await runtime.query("/main.css")).status !== 404) {
      cssTag = `
  <link rel="stylesheet" href="/main.css">`;
    }
    const needsJs = spa !== "none";
    let importMapHtml = "";
    if (needsJs) {
      const mapResponse = await runtime.query("/importmap.json");
      if (mapResponse.status !== 404) {
        const importMap = await mapResponse.text();
        importMapHtml = `
  <script type="importmap">
${importMap}
  </script>`;
      }
    }
    let scriptHtml = "";
    if (needsJs && (await runtime.query("/app.js")).status !== 404) {
      scriptHtml = `
  <script type="module" src="/app.js"></script>`;
    }
    return `<!DOCTYPE html>
<html>
<head>${baseTag}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>@view-transition { navigation: auto; } router-slot { display: contents; }</style>${manifestTag}${cssTag}
</head>
<body>
  <router-slot></router-slot>${importMapHtml}${scriptHtml}
</body>
</html>`;
  }
  static injectSsrContent(html, content, title, ssrRoute) {
    const slotPattern = /<router-slot\b[^>]*>.*?<\/router-slot>/s;
    if (!slotPattern.test(html))
      return html;
    const ssrAttr = ssrRoute ? ` data-ssr-route="${ssrRoute}"` : "";
    html = html.replace(slotPattern, `<router-slot${ssrAttr}>${content}</router-slot>`);
    if (title) {
      html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
    }
    return html;
  }
  static async resolveShell(runtime, title, basePath, spa) {
    const response = await runtime.query("/index.html");
    if (response.status !== 404)
      return await response.text();
    return Emroute.buildHtmlShell(runtime, title, basePath, spa);
  }
}

// dist/core/util/route-tree.util.js
function resolveTargetNode(node, name, isRoot) {
  if (name === "index") {
    if (isRoot)
      return node;
    node.wildcard ??= { param: "rest", child: {} };
    return node.wildcard.child;
  }
  if (name.startsWith("[") && name.endsWith("]")) {
    const param = name.slice(1, -1);
    node.dynamic ??= { param, child: {} };
    return node.dynamic.child;
  }
  node.children ??= {};
  node.children[name] ??= {};
  return node.children[name];
}

// dist/core/util/js.util.js
function escapeTemplateLiteral(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

// dist/runtime/abstract.runtime.js
var CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".ts", "text/typescript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"]
]);
var DEFAULT_ROUTES_DIR = "/routes";
var DEFAULT_WIDGETS_DIR = "/widgets";
var DEFAULT_ELEMENTS_DIR = "/elements";
class Runtime {
  config;
  constructor(config = {}) {
    this.config = config;
    this.config = config;
  }
  command(resource, options) {
    const path = typeof resource === "string" ? resource : new URL(resource instanceof Request ? resource.url : resource.toString()).pathname;
    const method = options?.method ?? "PUT";
    const isDelete = method === "DELETE";
    const result = this.handle(resource, { method, ...options });
    const routesDir = this.config.routesDir ?? DEFAULT_ROUTES_DIR;
    const widgetsDir = this.config.widgetsDir ?? DEFAULT_WIDGETS_DIR;
    const elementsDir = this.config.elementsDir ?? DEFAULT_ELEMENTS_DIR;
    if (path.startsWith(routesDir + "/")) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneRouteFromManifest(path, routesDir);
        } else {
          await this.mergeRouteIntoManifest(path, routesDir);
          await this.retranspileIfNeeded(path, routesDir, "route");
        }
        return res;
      });
    }
    if (path.startsWith(widgetsDir + "/")) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneWidgetFromManifest(path, widgetsDir);
        } else {
          await this.mergeWidgetIntoManifest(path, widgetsDir);
          await this.retranspileIfNeeded(path, widgetsDir, "widget");
        }
        return res;
      });
    }
    if (path.startsWith(elementsDir + "/")) {
      return result.then(async (res) => {
        if (isDelete) {
          await this.pruneElementFromManifest(path, elementsDir);
        } else {
          await this.mergeElementIntoManifest(path, elementsDir);
          await this.retranspileIfNeeded(path, elementsDir, "element");
        }
        return res;
      });
    }
    return result;
  }
  async mergeRouteIntoManifest(filePath, routesDir) {
    const relativePath = filePath.slice(routesDir.length + 1);
    const parts = relativePath.split("/");
    const filename = parts[parts.length - 1];
    const dirSegments = parts.slice(0, -1);
    const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
    if (!match)
      return;
    const name = match[1];
    const kind = match[2];
    const ext = match[3];
    const response = await this.handle(ROUTES_MANIFEST_PATH);
    const tree = response.status === 404 ? {} : await response.json();
    let node = tree;
    for (const dir of dirSegments) {
      if (dir.startsWith("[") && dir.endsWith("]")) {
        const param = dir.slice(1, -1);
        node.dynamic ??= { param, child: {} };
        node = node.dynamic.child;
      } else {
        node.children ??= {};
        node.children[dir] ??= {};
        node = node.children[dir];
      }
    }
    if (kind === "error") {
      node.errorBoundary = filePath;
    } else {
      const target = resolveTargetNode(node, name, dirSegments.length === 0);
      if (kind === "redirect") {
        target.redirect = filePath;
      } else {
        target.files ??= {};
        target.files[ext] = filePath;
      }
    }
    this.routesManifestCache = null;
    await this.handle(ROUTES_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(tree)
    });
  }
  async pruneRouteFromManifest(filePath, routesDir) {
    const relativePath = filePath.slice(routesDir.length + 1);
    const parts = relativePath.split("/");
    const filename = parts[parts.length - 1];
    const dirSegments = parts.slice(0, -1);
    const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
    if (!match)
      return;
    const name = match[1];
    const kind = match[2];
    const ext = match[3];
    const response = await this.handle(ROUTES_MANIFEST_PATH);
    if (response.status === 404)
      return;
    const tree = await response.json();
    const ancestors = [];
    let node = tree;
    for (const dir of dirSegments) {
      if (dir.startsWith("[") && dir.endsWith("]")) {
        if (!node.dynamic)
          return;
        ancestors.push({ node, key: dir, via: "dynamic" });
        node = node.dynamic.child;
      } else {
        if (!node.children?.[dir])
          return;
        ancestors.push({ node, key: dir, via: "children" });
        node = node.children[dir];
      }
    }
    if (kind === "error") {
      if (node.errorBoundary === filePath)
        delete node.errorBoundary;
    } else {
      const isRoot = dirSegments.length === 0;
      const target = this.findTargetNode(node, name, isRoot);
      if (!target)
        return;
      if (kind === "redirect") {
        if (target.redirect === filePath)
          delete target.redirect;
      } else {
        if (target.files?.[ext] === filePath) {
          delete target.files[ext];
          if (Object.keys(target.files).length === 0)
            delete target.files;
        }
      }
      if (target !== node && this.isEmptyNode(target)) {
        if (name === "index" && !isRoot) {
          delete node.wildcard;
        } else if (name.startsWith("[") && name.endsWith("]")) {
          delete node.dynamic;
        } else if (node.children) {
          delete node.children[name];
          if (Object.keys(node.children).length === 0)
            delete node.children;
        }
      }
    }
    for (let i = ancestors.length - 1;i >= 0; i--) {
      const { node: parent, key, via } = ancestors[i];
      const child = via === "dynamic" ? parent.dynamic?.child : parent.children?.[key];
      if (child && this.isEmptyNode(child)) {
        if (via === "dynamic") {
          delete parent.dynamic;
        } else if (parent.children) {
          delete parent.children[key];
          if (Object.keys(parent.children).length === 0)
            delete parent.children;
        }
      }
    }
    this.routesManifestCache = null;
    await this.handle(ROUTES_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(tree)
    });
  }
  findTargetNode(node, name, isRoot) {
    if (name === "index") {
      return isRoot ? node : node.wildcard?.child ?? null;
    }
    if (name.startsWith("[") && name.endsWith("]")) {
      return node.dynamic?.child ?? null;
    }
    return node.children?.[name] ?? null;
  }
  isEmptyNode(node) {
    return !node.files && !node.errorBoundary && !node.redirect && !node.children && !node.dynamic && !node.wildcard;
  }
  async pruneWidgetFromManifest(filePath, widgetsDir) {
    const relativePath = filePath.slice(widgetsDir.length + 1);
    const parts = relativePath.split("/");
    if (parts.length !== 2)
      return;
    const [dirName, filename] = parts;
    const match = filename.match(/^(.+?)\.widget\.(ts|js|html|md|css)$/);
    if (!match)
      return;
    const name = match[1];
    const ext = match[2];
    if (name !== dirName)
      return;
    const response = await this.handle(WIDGETS_MANIFEST_PATH);
    if (response.status === 404)
      return;
    const entries = await response.json();
    if (ext === "ts" || ext === "js") {
      const idx = entries.findIndex((e) => e.name === name);
      if (idx === -1)
        return;
      entries.splice(idx, 1);
    } else {
      const entry = entries.find((e) => e.name === name);
      if (!entry?.files)
        return;
      delete entry.files[ext];
      if (Object.keys(entry.files).length === 0)
        delete entry.files;
    }
    this.widgetsManifestCache = null;
    await this.handle(WIDGETS_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(entries)
    });
  }
  async pruneElementFromManifest(filePath, elementsDir) {
    const relativePath = filePath.slice(elementsDir.length + 1);
    const parts = relativePath.split("/");
    if (parts.length !== 2)
      return;
    const [dirName, filename] = parts;
    const match = filename.match(/^(.+?)\.element\.(ts|js)$/);
    if (!match)
      return;
    const name = match[1];
    if (name !== dirName)
      return;
    const response = await this.handle(ELEMENTS_MANIFEST_PATH);
    if (response.status === 404)
      return;
    const entries = await response.json();
    const idx = entries.findIndex((e) => e.name === name);
    if (idx === -1)
      return;
    entries.splice(idx, 1);
    this.elementsManifestCache = null;
    await this.handle(ELEMENTS_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(entries)
    });
  }
  async retranspileIfNeeded(filePath, dir, kind) {
    if (filePath.endsWith(".js"))
      return;
    const relativePath = filePath.slice(dir.length + 1);
    const parts = relativePath.split("/");
    const filename = parts[parts.length - 1];
    let jsPath;
    if (kind === "route") {
      const match = filename.match(/^(.+?)\.(page)\.(ts|html|md|css)$/);
      if (!match)
        return;
      const name = match[1];
      jsPath = `${dir}/${parts.slice(0, -1).join("/")}${parts.length > 1 ? "/" : ""}${name}.page.js`;
    } else if (kind === "widget") {
      const match = filename.match(/^(.+?)\.(widget)\.(ts|html|md|css)$/);
      if (!match)
        return;
      const name = match[1];
      jsPath = `${dir}/${name}/${name}.widget.js`;
    } else {
      const match = filename.match(/^(.+?)\.(element)\.ts$/);
      if (!match)
        return;
      const name = match[1];
      jsPath = `${dir}/${name}/${name}.element.js`;
    }
    const jsResponse = await this.handle(jsPath);
    if (jsResponse.status === 404)
      return;
    const tsPath = jsPath.replace(/\.js$/, ".ts");
    let tsSource;
    try {
      tsSource = await this.query(tsPath, { as: "text" });
    } catch {
      return;
    }
    let jsCode;
    try {
      jsCode = await this.transpileModule(tsPath, tsSource);
    } catch {
      return;
    }
    await this.handle(jsPath, { method: "PUT", body: jsCode });
  }
  loadModule(_path) {
    throw new Error(`loadModule not implemented for ${this.constructor.name}`);
  }
  transpile(_source) {
    throw new Error(`transpile not implemented for ${this.constructor.name}`);
  }
  async transpileModule(path, source) {
    let js = await this.transpile(source);
    const basePath = path.replace(/\.ts$/, "");
    const companions = ["html", "md", "css"];
    const entries = [];
    for (const ext of companions) {
      try {
        const content = await this.query(basePath + "." + ext, { as: "text" });
        entries.push(`  ${ext}: \`${escapeTemplateLiteral(content)}\``);
      } catch {}
    }
    if (entries.length > 0) {
      js += `
export const __files = {
${entries.join(`,
`)}
};
`;
    }
    return js;
  }
  async mergeWidgetIntoManifest(filePath, widgetsDir) {
    const relativePath = filePath.slice(widgetsDir.length + 1);
    const parts = relativePath.split("/");
    if (parts.length !== 2)
      return;
    const [dirName, filename] = parts;
    const match = filename.match(/^(.+?)\.widget\.(ts|js|html|md|css)$/);
    if (!match)
      return;
    const name = match[1];
    const ext = match[2];
    if (name !== dirName)
      return;
    const response = await this.handle(WIDGETS_MANIFEST_PATH);
    const entries = response.status === 404 ? [] : await response.json();
    const prefix = widgetsDir.replace(/^\//, "");
    if (ext === "ts" || ext === "js") {
      let entry = entries.find((e) => e.name === name);
      if (!entry) {
        entry = {
          name,
          modulePath: `${prefix}/${name}/${filename}`,
          tagName: `widget-${name}`
        };
        entries.push(entry);
        entries.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        entry.modulePath = `${prefix}/${name}/${filename}`;
      }
    } else {
      const entry = entries.find((e) => e.name === name);
      if (!entry)
        return;
      entry.files ??= {};
      entry.files[ext] = `${prefix}/${name}/${filename}`;
    }
    this.widgetsManifestCache = null;
    await this.handle(WIDGETS_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(entries)
    });
  }
  async mergeElementIntoManifest(filePath, elementsDir) {
    const relativePath = filePath.slice(elementsDir.length + 1);
    const parts = relativePath.split("/");
    if (parts.length !== 2)
      return;
    const [dirName, filename] = parts;
    const match = filename.match(/^(.+?)\.element\.(ts|js)$/);
    if (!match)
      return;
    const name = match[1];
    if (name !== dirName)
      return;
    if (!name.includes("-"))
      return;
    const response = await this.handle(ELEMENTS_MANIFEST_PATH);
    const entries = response.status === 404 ? [] : await response.json();
    const prefix = elementsDir.replace(/^\//, "");
    let entry = entries.find((e) => e.name === name);
    if (!entry) {
      entry = {
        name,
        modulePath: `${prefix}/${name}/${filename}`,
        tagName: name
      };
      entries.push(entry);
      entries.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      entry.modulePath = `${prefix}/${name}/${filename}`;
    }
    this.elementsManifestCache = null;
    await this.handle(ELEMENTS_MANIFEST_PATH, {
      method: "PUT",
      body: JSON.stringify(entries)
    });
  }
  routesManifestCache = null;
  widgetsManifestCache = null;
  elementsManifestCache = null;
  invalidateManifests() {
    this.routesManifestCache = null;
    this.widgetsManifestCache = null;
    this.elementsManifestCache = null;
  }
  async resolveRoutesManifest() {
    if (this.routesManifestCache)
      return this.routesManifestCache.clone();
    const routesDir = this.config.routesDir ?? DEFAULT_ROUTES_DIR;
    const dirResponse = await this.query(routesDir + "/");
    if (dirResponse.status === 404) {
      return new Response("Not Found", { status: 404 });
    }
    const tree = await this.scanRoutes(routesDir);
    this.routesManifestCache = Response.json(tree);
    return this.routesManifestCache.clone();
  }
  async resolveWidgetsManifest() {
    if (this.widgetsManifestCache)
      return this.widgetsManifestCache.clone();
    const widgetsDir = this.config.widgetsDir ?? DEFAULT_WIDGETS_DIR;
    const dirResponse = await this.query(widgetsDir + "/");
    const entries = dirResponse.status === 404 ? [] : await this.scanWidgets(widgetsDir, widgetsDir.replace(/^\//, ""));
    this.widgetsManifestCache = Response.json(entries);
    return this.widgetsManifestCache.clone();
  }
  async resolveElementsManifest() {
    if (this.elementsManifestCache)
      return this.elementsManifestCache.clone();
    const elementsDir = this.config.elementsDir ?? DEFAULT_ELEMENTS_DIR;
    const dirResponse = await this.query(elementsDir + "/");
    const entries = dirResponse.status === 404 ? [] : await this.scanElements(elementsDir, elementsDir.replace(/^\//, ""));
    this.elementsManifestCache = Response.json(entries);
    return this.elementsManifestCache.clone();
  }
  async* walkDirectory(dir) {
    const trailingDir = dir.endsWith("/") ? dir : dir + "/";
    const response = await this.query(trailingDir);
    const entries = await response.json();
    for (const entry of entries) {
      const path = `${trailingDir}${entry}`;
      if (entry.endsWith("/")) {
        yield* this.walkDirectory(path);
      } else {
        yield path;
      }
    }
  }
  async scanRoutes(routesDir) {
    const root = {};
    const allFiles = [];
    for await (const file of this.walkDirectory(routesDir)) {
      allFiles.push(file);
    }
    for (const filePath of allFiles) {
      const relativePath = filePath.replace(`${routesDir}/`, "");
      const parts = relativePath.split("/");
      const filename = parts[parts.length - 1];
      const dirSegments = parts.slice(0, -1);
      const match = filename.match(/^(.+?)\.(page|error|redirect)\.(ts|js|html|md|css)$/);
      if (!match)
        continue;
      const name = match[1];
      const kind = match[2];
      const ext = match[3];
      let node = root;
      for (const dir of dirSegments) {
        if (dir.startsWith("[") && dir.endsWith("]")) {
          const param = dir.slice(1, -1);
          node.dynamic ??= { param, child: {} };
          node = node.dynamic.child;
        } else {
          node.children ??= {};
          node.children[dir] ??= {};
          node = node.children[dir];
        }
      }
      if (kind === "error") {
        node.errorBoundary = filePath;
        continue;
      }
      const target = resolveTargetNode(node, name, dirSegments.length === 0);
      if (kind === "redirect") {
        target.redirect = filePath;
      } else {
        target.files ??= {};
        target.files[ext] = filePath;
      }
    }
    return root;
  }
  async scanWidgets(widgetsDir, pathPrefix) {
    const COMPANION_EXTENSIONS = ["html", "md", "css"];
    const entries = [];
    const trailingDir = widgetsDir.endsWith("/") ? widgetsDir : widgetsDir + "/";
    const response = await this.query(trailingDir);
    const listing = await response.json();
    for (const item of listing) {
      if (!item.endsWith("/"))
        continue;
      const name = item.slice(0, -1);
      let moduleFile = `${name}.widget.ts`;
      let modulePath = `${trailingDir}${name}/${moduleFile}`;
      if ((await this.query(modulePath)).status === 404) {
        moduleFile = `${name}.widget.js`;
        modulePath = `${trailingDir}${name}/${moduleFile}`;
        if ((await this.query(modulePath)).status === 404)
          continue;
      }
      const prefix = pathPrefix ? `${pathPrefix}/` : "";
      const entry = {
        name,
        modulePath: `${prefix}${name}/${moduleFile}`,
        tagName: `widget-${name}`
      };
      const files = {};
      let hasFiles = false;
      const companionResults = await Promise.all(COMPANION_EXTENSIONS.map(async (ext) => {
        const companionFile = `${name}.widget.${ext}`;
        const companionPath = `${trailingDir}${name}/${companionFile}`;
        const exists = (await this.query(companionPath)).status !== 404;
        return { ext, exists, path: `${prefix}${name}/${companionFile}` };
      }));
      for (const { ext, exists, path } of companionResults) {
        if (exists) {
          files[ext] = path;
          hasFiles = true;
        }
      }
      if (hasFiles)
        entry.files = files;
      entries.push(entry);
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }
  async scanElements(elementsDir, pathPrefix) {
    const entries = [];
    const trailingDir = elementsDir.endsWith("/") ? elementsDir : elementsDir + "/";
    const response = await this.query(trailingDir);
    const listing = await response.json();
    for (const item of listing) {
      if (!item.endsWith("/"))
        continue;
      const name = item.slice(0, -1);
      if (!name.includes("-")) {
        console.warn(`[emroute] Skipping element "${name}": custom element names must contain a hyphen (e.g. "my-element")`);
        continue;
      }
      let moduleFile = `${name}.element.ts`;
      let modulePath = `${trailingDir}${name}/${moduleFile}`;
      if ((await this.query(modulePath)).status === 404) {
        moduleFile = `${name}.element.js`;
        modulePath = `${trailingDir}${name}/${moduleFile}`;
        if ((await this.query(modulePath)).status === 404)
          continue;
      }
      const prefix = pathPrefix ? `${pathPrefix}/` : "";
      entries.push({
        name,
        modulePath: `${prefix}${name}/${moduleFile}`,
        tagName: name
      });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
  }
}

// dist/runtime/fetch.runtime.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
};

class FetchRuntime extends Runtime {
  origin;
  constructor(origin, config = {}) {
    super(config);
    this.origin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  }
  handle(resource, init) {
    const url = this.toUrl(resource);
    return fetch(url, init);
  }
  query(resource, options) {
    if (options?.as === "text") {
      return fetch(this.toUrl(resource)).then((r) => r.text());
    }
    return this.handle(resource, options);
  }
  async loadModule(path) {
    const url = `${this.origin}${path}`;
    const response = await fetch(url);
    const js = await response.text();
    const blob = new Blob([js], { type: "application/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await import(__rewriteRelativeImportExtension(objectUrl));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  toUrl(resource) {
    if (typeof resource === "string")
      return `${this.origin}${resource}`;
    if (resource instanceof URL)
      return `${this.origin}${resource.pathname}${resource.search}`;
    return `${this.origin}${new URL(resource.url).pathname}`;
  }
}

// dist/src/renderer/spa/emroute.app.js
class EmrouteApp {
  server;
  appBase;
  slot = null;
  abortController = null;
  constructor(server, options) {
    this.server = server;
    if (options?.basePath) {
      this.appBase = options.basePath.app;
    } else if (typeof document !== "undefined") {
      const base = document.querySelector("base")?.getAttribute("href");
      this.appBase = base ? base.replace(/\/$/, "") : DEFAULT_BASE_PATH.app;
    } else {
      this.appBase = DEFAULT_BASE_PATH.app;
    }
  }
  async initialize(slotSelector = "router-slot") {
    this.slot = document.querySelector(slotSelector);
    if (!this.slot) {
      console.error("[EmrouteApp] Slot not found:", slotSelector);
      return;
    }
    if (!("navigation" in globalThis)) {
      console.warn("[EmrouteApp] Navigation API not available");
      return;
    }
    this.abortController = new AbortController;
    const { signal } = this.abortController;
    navigation.addEventListener("navigate", (event) => {
      if (!event.canIntercept)
        return;
      if (event.hashChange)
        return;
      if (event.downloadRequest !== null)
        return;
      const url = new URL(event.destination.url);
      if (!this.isAppPath(url.pathname))
        return;
      event.intercept({
        scroll: "manual",
        handler: async () => {
          await this.handleNavigation(url, event.signal);
          event.scroll();
        }
      });
    }, { signal });
    const ssrRoute = this.slot.getAttribute("data-ssr-route");
    if (ssrRoute && (location.pathname === ssrRoute || location.pathname === ssrRoute + "/")) {
      this.slot.removeAttribute("data-ssr-route");
      return;
    }
    await this.handleNavigation(new URL(location.href), this.abortController.signal);
  }
  dispose() {
    this.abortController?.abort();
    this.abortController = null;
    this.slot = null;
  }
  async navigate(url, options = {}) {
    try {
      const { finished } = navigation.navigate(url, {
        state: options.state,
        history: options.replace ? "replace" : "auto"
      });
      await finished;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError")
        return;
      throw e;
    }
  }
  isAppPath(pathname) {
    return pathname === this.appBase || pathname.startsWith(this.appBase + "/");
  }
  stripAppBase(pathname) {
    if (pathname === this.appBase)
      return "/";
    if (pathname.startsWith(this.appBase + "/"))
      return pathname.slice(this.appBase.length);
    return pathname;
  }
  async handleNavigation(url, signal) {
    if (!this.slot || !this.server.htmlRenderer)
      return;
    const routePath = this.stripAppBase(url.pathname);
    const routeUrl = new URL(routePath + url.search, url.origin);
    try {
      const { content, title, redirect } = await this.server.htmlRenderer.render(routeUrl, signal);
      if (signal.aborted)
        return;
      if (redirect) {
        assertSafeRedirect(redirect);
        const target = redirect.startsWith("/") ? this.appBase + redirect : redirect;
        navigation.navigate(target, { history: "replace" });
        return;
      }
      if (document.startViewTransition) {
        const transition = document.startViewTransition(() => {
          this.slot.setHTMLUnsafe(content);
        });
        signal.addEventListener("abort", () => transition.skipTransition(), { once: true });
        await transition.updateCallbackDone;
      } else {
        this.slot.setHTMLUnsafe(content);
      }
      if (title)
        document.title = title;
    } catch (error) {
      if (signal.aborted)
        return;
      console.error("[EmrouteApp] Navigation error:", error);
      if (this.slot) {
        const message = error instanceof Error ? error.message : String(error);
        this.slot.setHTMLUnsafe(`<h1>Error</h1><p>${escapeHtml(message)}</p>`);
      }
    }
  }
}
async function createEmrouteApp(server, options) {
  const g = globalThis;
  if (g.__emroute_app) {
    console.warn("eMroute: App already initialized.");
    return g.__emroute_app;
  }
  const app = new EmrouteApp(server, options);
  await app.initialize();
  g.__emroute_app = app;
  return app;
}
async function bootEmrouteApp(options) {
  const origin = options?.origin ?? location.origin;
  const runtime = new FetchRuntime(origin);
  const routesResponse = await runtime.handle(ROUTES_MANIFEST_PATH);
  if (!routesResponse.ok) {
    throw new Error(`[emroute] Failed to fetch ${ROUTES_MANIFEST_PATH}: ${routesResponse.status}`);
  }
  const routeTree = await routesResponse.json();
  const widgetsResponse = await runtime.handle(WIDGETS_MANIFEST_PATH);
  const widgetEntries = widgetsResponse.ok ? await widgetsResponse.json() : [];
  const elementsResponse = await runtime.handle(ELEMENTS_MANIFEST_PATH);
  const elementEntries = elementsResponse.ok ? await elementsResponse.json() : [];
  const moduleLoaders = buildLazyLoaders(routeTree, widgetEntries, elementEntries, runtime);
  for (const entry of widgetEntries) {
    ComponentElement.registerLazy(entry.name, moduleLoaders[entry.modulePath]);
  }
  for (const entry of elementEntries) {
    const loader = moduleLoaders[entry.modulePath];
    if (loader) {
      loader().then((mod) => {
        const cls = mod.default;
        if (typeof cls === "function" && !customElements.get(entry.tagName)) {
          customElements.define(entry.tagName, cls);
        }
      }).catch((e) => {
        console.error(`[emroute] Failed to load element ${entry.tagName}:`, e);
      });
    }
  }
  if (options?.extendContext) {
    ComponentElement.setContextProvider(options.extendContext);
  }
  const mdRenderer = MarkdownElement.getConfiguredRenderer();
  const server = await Emroute.create({
    routeTree,
    moduleLoaders,
    shell: () => document.documentElement.outerHTML,
    ...mdRenderer ? { markdownRenderer: mdRenderer } : {},
    ...options?.extendContext ? { extendContext: options.extendContext } : {}
  }, runtime);
  return createEmrouteApp(server, options);
}
function buildLazyLoaders(tree, widgetEntries, elementEntries, runtime) {
  const paths = new Set;
  function walk(node) {
    const modulePath = node.files?.ts ?? node.files?.js;
    if (modulePath)
      paths.add(modulePath);
    if (node.redirect)
      paths.add(node.redirect);
    if (node.errorBoundary)
      paths.add(node.errorBoundary);
    if (node.children) {
      for (const child of Object.values(node.children))
        walk(child);
    }
    if (node.dynamic)
      walk(node.dynamic.child);
    if (node.wildcard)
      walk(node.wildcard.child);
  }
  walk(tree);
  for (const entry of widgetEntries)
    paths.add(entry.modulePath);
  for (const entry of elementEntries)
    paths.add(entry.modulePath);
  const loaders = {};
  for (const path of paths) {
    const absolute = path.startsWith("/") ? path : "/" + path;
    loaders[path] = () => runtime.loadModule(absolute);
  }
  return loaders;
}
// dist/core/component/widget.component.js
class WidgetComponent extends Component {
  renderHTML(args) {
    const files = args.context.files;
    if (files?.html) {
      return files.html;
    }
    if (files?.md) {
      return `<mark-down>${escapeHtml(files.md)}</mark-down>`;
    }
    return super.renderHTML(args);
  }
  renderMarkdown(args) {
    const files = args.context.files;
    if (files?.md) {
      return files.md;
    }
    return "";
  }
}
// dist/src/overlay/overlay.css.js
var overlayCSS = `
:root {
  --overlay-backdrop: oklch(0% 0 0 / 0.5);
  --overlay-surface: oklch(100% 0 0);
  --overlay-radius: 8px;
  --overlay-shadow: 0 8px 32px oklch(0% 0 0 / 0.2);
  --overlay-toast-gap: 8px;
  --overlay-toast-duration: 5s;
  --overlay-z: 1000;
}

/* --- Modal (dialog) --- */

dialog[data-overlay-modal] {
  border: none;
  padding: 0;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  max-width: min(90vw, 560px);
  max-height: 85vh;
  overflow: auto;
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 200ms,
    translate 200ms;
}

dialog[data-overlay-modal][open] {
  transition:
    opacity 200ms,
    translate 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
    translate: 0 20px;
  }
}

dialog[data-overlay-modal]::backdrop {
  background: var(--overlay-backdrop);
  opacity: 1;
  transition: opacity 200ms;
}

dialog[data-overlay-modal][open]::backdrop {
  transition:
    opacity 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
  }
}

dialog[data-overlay-modal][data-dismissing] {
  opacity: 0;
  translate: 0 20px;
}

dialog[data-overlay-modal][data-dismissing]::backdrop {
  opacity: 0;
}

/* --- Toast container --- */

[data-overlay-toast-container] {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: var(--overlay-z);
  display: flex;
  flex-direction: column;
  gap: var(--overlay-toast-gap);
  pointer-events: none;
}

/* --- Toast item --- */

[data-overlay-toast] {
  pointer-events: auto;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  padding: 12px 16px;
  animation: overlay-toast-auto var(--overlay-toast-duration, 5s) ease-in-out forwards;
}

/* Manual toast (timeout: 0): no auto-dismiss, entry transition only */
[data-overlay-toast][data-toast-manual] {
  animation: none;
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 200ms,
    translate 200ms;

  @starting-style {
    opacity: 0;
    translate: 20px 0;
  }
}

/* Dismissed toast: CSS exit animation */
[data-overlay-toast][data-dismissing] {
  animation: overlay-toast-exit 200ms ease-in forwards;
}

@keyframes overlay-toast-auto {
  0%   { opacity: 0; translate: 20px 0; }
  10%  { opacity: 1; translate: 0 0; }
  80%  { opacity: 1; translate: 0 0; }
  100% { opacity: 0; translate: 0 0; display: none; }
}

@keyframes overlay-toast-exit {
  to { opacity: 0; translate: 20px 0; display: none; }
}

/* --- Popover --- */

[data-overlay-popover] {
  border: none;
  padding: 0;
  margin: 0;
  background: var(--overlay-surface);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
  opacity: 1;
  scale: 1;
  transition:
    opacity 200ms,
    scale 200ms;
}

[data-overlay-popover]:popover-open {
  position-anchor: auto;
  inset: unset;
  top: anchor(bottom);
  left: anchor(start);
  margin-top: 4px;
  transition:
    opacity 200ms,
    scale 200ms,
    display 200ms allow-discrete,
    overlay 200ms allow-discrete;

  @starting-style {
    opacity: 0;
    scale: 0.95;
  }
}

[data-overlay-popover][data-dismissing] {
  opacity: 0;
  scale: 0.95;
}
`;

// dist/src/overlay/overlay.service.js
var ANIMATION_SAFETY_TIMEOUT = 300;
function animateDismiss(el, onDone) {
  el.setAttribute("data-dismissing", "");
  let done = false;
  const finish = () => {
    if (done)
      return;
    done = true;
    onDone();
  };
  el.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, ANIMATION_SAFETY_TIMEOUT);
}
function fillTemplate(el, options, onConfirm, onReject) {
  const msgEl = el.querySelector("[data-toast-message]");
  if (msgEl && options.message) {
    msgEl.textContent = options.message;
  }
  if (options.type) {
    el.setAttribute("data-toast-type", options.type);
  }
  const confirmBtn = el.querySelector("[data-toast-confirm]");
  if (confirmBtn) {
    if (options.confirm) {
      confirmBtn.textContent = options.confirm;
      confirmBtn.hidden = false;
      if (onConfirm)
        confirmBtn.addEventListener("click", onConfirm, { once: true });
    } else {
      confirmBtn.hidden = true;
    }
  }
  const rejectBtn = el.querySelector("[data-toast-reject]");
  if (rejectBtn) {
    if (options.reject) {
      rejectBtn.textContent = options.reject;
      rejectBtn.hidden = false;
      if (onReject)
        rejectBtn.addEventListener("click", onReject, { once: true });
    } else {
      rejectBtn.hidden = true;
    }
  }
}
function buildFallback(el, options, onConfirm, onReject) {
  if (options.type) {
    el.setAttribute("data-toast-type", options.type);
  }
  const span = document.createElement("span");
  span.setAttribute("data-toast-message", "");
  span.textContent = options.message ?? "";
  el.appendChild(span);
  if (options.confirm) {
    const btn = document.createElement("button");
    btn.setAttribute("data-toast-confirm", "");
    btn.textContent = options.confirm;
    if (onConfirm)
      btn.addEventListener("click", onConfirm, { once: true });
    el.appendChild(btn);
  }
  if (options.reject) {
    const btn = document.createElement("button");
    btn.setAttribute("data-toast-reject", "");
    btn.textContent = options.reject;
    if (onReject)
      btn.addEventListener("click", onReject, { once: true });
    el.appendChild(btn);
  }
}
function createOverlayService() {
  let styleInjected = false;
  let dialog = null;
  let modalResolve = null;
  let modalOnClose;
  let toastContainer = null;
  let popoverEl = null;
  let popoverAnchorObserver = null;
  const supportsAnchor = typeof CSS !== "undefined" && CSS.supports("anchor-name", "--a");
  function injectCSS() {
    if (styleInjected)
      return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = overlayCSS;
    document.head.appendChild(style);
  }
  function ensureDialog() {
    if (dialog)
      return dialog;
    injectCSS();
    dialog = document.createElement("dialog");
    dialog.setAttribute("data-overlay-modal", "");
    document.body.appendChild(dialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        closeModal(undefined);
      }
    });
    return dialog;
  }
  function ensureToastContainer() {
    if (toastContainer)
      return toastContainer;
    injectCSS();
    toastContainer = document.createElement("div");
    toastContainer.setAttribute("data-overlay-toast-container", "");
    document.body.appendChild(toastContainer);
    return toastContainer;
  }
  function ensurePopover() {
    if (popoverEl)
      return popoverEl;
    injectCSS();
    popoverEl = document.createElement("div");
    popoverEl.setAttribute("data-overlay-popover", "");
    popoverEl.setAttribute("popover", "");
    document.body.appendChild(popoverEl);
    return popoverEl;
  }
  function modal(options) {
    const d = ensureDialog();
    d.removeAttribute("data-dismissing");
    hidePopoverImmediate();
    if (d.open) {
      d.close();
      if (modalResolve) {
        modalResolve(undefined);
        modalResolve = null;
      }
      if (modalOnClose) {
        modalOnClose();
        modalOnClose = undefined;
      }
    }
    d.innerHTML = "";
    options.render(d);
    modalOnClose = options.onClose;
    const { promise, resolve } = Promise.withResolvers();
    modalResolve = resolve;
    d.showModal();
    return promise;
  }
  function closeModal(value) {
    if (!dialog || !dialog.open)
      return;
    const resolve = modalResolve;
    const onClose = modalOnClose;
    const dialogRef = dialog;
    modalResolve = null;
    modalOnClose = undefined;
    animateDismiss(dialogRef, () => {
      if (dialogRef && dialogRef.open) {
        dialogRef.close();
        if (resolve)
          resolve(value);
        if (onClose)
          onClose();
      }
    });
  }
  function clearDeadToasts(container) {
    for (const child of [...container.children]) {
      const el = child;
      if (el.hasAttribute("data-dismissing")) {
        el.remove();
      }
    }
  }
  function toast(options) {
    const container = ensureToastContainer();
    clearDeadToasts(container);
    const el = document.createElement("div");
    el.setAttribute("data-overlay-toast", "");
    const isConfirmation = !!(options.confirm || options.reject);
    const timeout = isConfirmation ? 0 : options.timeout ?? 0;
    if (timeout === 0) {
      el.setAttribute("data-toast-manual", "");
    } else {
      el.style.setProperty("--overlay-toast-duration", `${timeout}ms`);
    }
    let confirmResolve;
    let confirmPromise;
    if (isConfirmation) {
      const resolvers = Promise.withResolvers();
      confirmResolve = resolvers.resolve;
      confirmPromise = resolvers.promise;
    }
    const onConfirm = confirmResolve ? () => {
      confirmResolve(true);
      dismiss();
    } : undefined;
    const onReject = confirmResolve ? () => {
      confirmResolve(false);
      dismiss();
    } : undefined;
    if (options.render) {
      options.render(el);
    } else {
      const template = document.querySelector("#overlay-toast");
      if (template) {
        const clone = template.content.cloneNode(true);
        el.appendChild(clone);
        fillTemplate(el, options, onConfirm, onReject);
      } else {
        buildFallback(el, options, onConfirm, onReject);
      }
    }
    container.appendChild(el);
    const id = performance.now();
    let dismissed = false;
    function dismiss() {
      if (dismissed)
        return;
      dismissed = true;
      el.setAttribute("data-dismissing", "");
    }
    function update(opts) {
      if (opts.message !== undefined) {
        const msgEl = el.querySelector("[data-toast-message]");
        if (msgEl)
          msgEl.textContent = opts.message;
      }
      if (opts.type !== undefined) {
        el.setAttribute("data-toast-type", opts.type);
      }
      if (opts.timeout !== undefined) {
        el.style.setProperty("--overlay-toast-duration", `${opts.timeout}ms`);
        if (opts.timeout === 0) {
          el.setAttribute("data-toast-manual", "");
        } else {
          el.removeAttribute("data-toast-manual");
        }
      }
    }
    const handle = { id, dismiss, update };
    if (confirmPromise) {
      handle.then = confirmPromise.then.bind(confirmPromise);
    }
    return handle;
  }
  toast.success = (message, timeout) => toast({ message, type: "success", timeout: timeout ?? 5000 });
  toast.error = (message, timeout) => toast({ message, type: "error", timeout: timeout ?? 5000 });
  toast.warning = (message, timeout) => toast({ message, type: "warning", timeout: timeout ?? 5000 });
  toast.info = (message, timeout) => toast({ message, type: "info", timeout: timeout ?? 5000 });
  function popover(options) {
    const el = ensurePopover();
    cleanupPopoverAnchorObserver();
    try {
      el.hidePopover();
    } catch {}
    el.removeAttribute("data-dismissing");
    el.innerHTML = "";
    options.render(el);
    if (supportsAnchor) {
      const anchorName = "--overlay-anchor";
      options.anchor.style.setProperty("anchor-name", anchorName);
      el.style.setProperty("position-anchor", anchorName);
      el.style.removeProperty("top");
      el.style.removeProperty("left");
    } else {
      const rect = options.anchor.getBoundingClientRect();
      el.style.top = `${rect.bottom + globalThis.scrollY}px`;
      el.style.left = `${rect.left + globalThis.scrollX}px`;
      el.style.position = "absolute";
    }
    el.showPopover();
    watchAnchorDisconnect(options.anchor);
  }
  function watchAnchorDisconnect(anchor) {
    cleanupPopoverAnchorObserver();
    const parent = anchor.parentNode;
    if (!parent) {
      closePopover();
      return;
    }
    popoverAnchorObserver = new MutationObserver(() => {
      if (!document.contains(anchor)) {
        closePopover();
      }
    });
    popoverAnchorObserver.observe(parent, { childList: true });
  }
  function hidePopoverImmediate() {
    cleanupPopoverAnchorObserver();
    if (!popoverEl)
      return;
    try {
      popoverEl.hidePopover();
    } catch {}
    popoverEl.removeAttribute("data-dismissing");
  }
  function cleanupPopoverAnchorObserver() {
    if (popoverAnchorObserver) {
      popoverAnchorObserver.disconnect();
      popoverAnchorObserver = null;
    }
  }
  function closePopover() {
    cleanupPopoverAnchorObserver();
    if (!popoverEl)
      return;
    let isOpen;
    try {
      isOpen = popoverEl.matches(":popover-open");
    } catch {
      isOpen = popoverEl.hasAttribute("popover") && popoverEl.style.display !== "none";
    }
    if (!isOpen)
      return;
    animateDismiss(popoverEl, () => {
      try {
        popoverEl.hidePopover();
      } catch {}
    });
  }
  function dismissAll() {
    if (dialog && dialog.open) {
      const resolve = modalResolve;
      const onClose = modalOnClose;
      modalResolve = null;
      modalOnClose = undefined;
      dialog.removeAttribute("data-dismissing");
      dialog.close();
      if (resolve)
        resolve(undefined);
      if (onClose)
        onClose();
    }
    hidePopoverImmediate();
    if (toastContainer) {
      for (const child of toastContainer.children) {
        child.setAttribute("data-dismissing", "");
      }
    }
    try {
      for (const el of document.querySelectorAll(":popover-open")) {
        el.hidePopover();
      }
    } catch {}
    for (const el of document.querySelectorAll("dialog[open]")) {
      if (el !== dialog)
        el.close();
    }
  }
  return {
    modal,
    closeModal,
    toast,
    popover,
    closePopover,
    dismissAll
  };
}
// dist/runtime/cache.runtime.js
var __rewriteRelativeImportExtension2 = function(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
};

class CacheRuntime extends Runtime {
  cache = null;
  cacheName;
  constructor(cacheName, config = {}) {
    super(config);
    this.cacheName = cacheName;
  }
  async getCache() {
    this.cache ??= await caches.open(this.cacheName);
    return this.cache;
  }
  handle(resource, init) {
    const path = this.parsePath(resource);
    const method = init?.method ?? "GET";
    switch (method) {
      case "PUT":
        return this.write(path, init?.body ?? null);
      case "DELETE":
        return this.delete(path);
      default:
        return this.read(path);
    }
  }
  query(resource, options) {
    if (options?.as === "text") {
      return this.read(this.parsePath(resource)).then(async (r) => {
        if (r.status === 404)
          throw new Error(`Not found: ${this.parsePath(resource)}`);
        return r.text();
      });
    }
    return this.handle(resource, options);
  }
  async loadModule(path) {
    const response = await this.read(path);
    if (response.status === 404) {
      throw new Error(`Module not found in cache: ${path}`);
    }
    const js = await response.text();
    const blob = new Blob([js], { type: "application/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await import(__rewriteRelativeImportExtension2(objectUrl));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  async read(path) {
    const cache = await this.getCache();
    const key = new Request(this.toFakeUrl(path));
    const cached = await cache.match(key);
    if (!cached)
      return new Response("Not Found", { status: 404 });
    return cached;
  }
  async write(path, body) {
    const cache = await this.getCache();
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    const contentType = CONTENT_TYPES.get(ext) ?? "application/octet-stream";
    const response = new Response(body, {
      status: 200,
      headers: { "Content-Type": contentType }
    });
    await cache.put(new Request(this.toFakeUrl(path)), response);
    return new Response(null, { status: 204 });
  }
  async delete(path) {
    const cache = await this.getCache();
    await cache.delete(new Request(this.toFakeUrl(path)));
    return new Response(null, { status: 204 });
  }
  parsePath(resource) {
    if (typeof resource === "string")
      return resource;
    if (resource instanceof URL)
      return resource.pathname;
    return new URL(resource.url).pathname;
  }
  toFakeUrl(path) {
    return `https://emroute-cache${path}`;
  }
}

// dist/runtime/idb.runtime.js
var __rewriteRelativeImportExtension3 = function(path, preserveJsx) {
  if (typeof path === "string" && /^\.\.?\//.test(path)) {
    return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
      return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
    });
  }
  return path;
};
var STORE_NAME = "files";

class IdbRuntime extends Runtime {
  db = null;
  dbName;
  constructor(dbName, config = {}) {
    super(config);
    this.dbName = dbName;
  }
  open() {
    if (this.db)
      return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      request.onerror = () => reject(request.error);
    });
  }
  handle(resource, init) {
    const [pathname, method, body] = this.parse(resource, init);
    switch (method) {
      case "PUT":
        return this.write(pathname, body);
      case "DELETE":
        return this.delete(pathname);
      default:
        return this.read(pathname);
    }
  }
  query(resource, options) {
    if (options?.as === "text") {
      const pathname = this.parsePath(resource);
      return this.get(pathname).then((data) => {
        if (!data)
          throw new Error(`Not found: ${pathname}`);
        return new TextDecoder().decode(data);
      });
    }
    return this.handle(resource, options);
  }
  async loadModule(path) {
    const data = await this.get(path);
    if (!data)
      throw new Error(`Module not found in IDB: ${path}`);
    const buf = data.buffer;
    const blob = new Blob([buf], { type: "application/javascript" });
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await import(__rewriteRelativeImportExtension3(objectUrl));
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  async read(path) {
    if (path.endsWith("/")) {
      const children = await this.listChildren(path);
      if (children.length === 0)
        return new Response("Not Found", { status: 404 });
      return Response.json(children);
    }
    const data = await this.get(path);
    if (!data) {
      const children = await this.listChildren(path + "/");
      if (children.length > 0)
        return Response.json(children);
      return new Response("Not Found", { status: 404 });
    }
    const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
    return new Response(data.buffer, {
      status: 200,
      headers: { "Content-Type": CONTENT_TYPES.get(ext) ?? "application/octet-stream" }
    });
  }
  async write(path, body) {
    const data = body ? new Uint8Array(await new Response(body).arrayBuffer()) : new Uint8Array;
    await this.put(path, data);
    return new Response(null, { status: 204 });
  }
  async delete(path) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(path);
      tx.oncomplete = () => resolve(new Response(null, { status: 204 }));
      tx.onerror = () => reject(tx.error);
    });
  }
  async get(path) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(path);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async put(path, data) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(data, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async listChildren(prefix) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const range = IDBKeyRange.bound(prefix, prefix + "￿", false, false);
      const req = store.getAllKeys(range);
      req.onsuccess = () => {
        const entries = new Set;
        for (const key of req.result) {
          const rest = key.slice(prefix.length);
          const slashIdx = rest.indexOf("/");
          if (slashIdx === -1) {
            entries.add(rest);
          } else {
            entries.add(rest.slice(0, slashIdx + 1));
          }
        }
        resolve([...entries]);
      };
      req.onerror = () => reject(req.error);
    });
  }
  parsePath(resource) {
    if (typeof resource === "string")
      return resource;
    if (resource instanceof URL)
      return resource.pathname;
    return new URL(resource.url).pathname;
  }
  parse(resource, init) {
    const pathname = this.parsePath(resource);
    if (typeof resource === "string" || resource instanceof URL) {
      return [pathname, init?.method ?? "GET", init?.body ?? null];
    }
    return [
      pathname,
      init?.method ?? resource.method,
      init?.body ?? resource.body
    ];
  }
}

// dist/src/service-worker/emroute.sw.js
class SwRuntime extends Runtime {
  cache;
  idb;
  constructor(cache, idb) {
    super();
    this.cache = cache;
    this.idb = idb;
  }
  handle(resource, init) {
    const method = init?.method ?? "GET";
    if (method === "PUT" || method === "DELETE") {
      return this.idb.handle(resource, init);
    }
    return this.cache.handle(resource, init).then(async (r) => {
      if (r.status !== 404)
        return r;
      return this.idb.handle(resource, init);
    });
  }
  query(resource, options) {
    if (options?.as === "text") {
      return this.handle(resource, options).then(async (r) => {
        if (r.status === 404) {
          const path = typeof resource === "string" ? resource : resource instanceof URL ? resource.pathname : new URL(resource.url).pathname;
          throw new Error(`Not found: ${path}`);
        }
        return r.text();
      });
    }
    return this.handle(resource, options);
  }
  async loadModule(path) {
    try {
      return await this.cache.loadModule(path);
    } catch {
      return await this.idb.loadModule(path);
    }
  }
}
function createEmrouteSW(options) {
  const { cacheName, precache, content = [], dbName = "emroute-content", origin = self.location.origin } = options;
  const cacheRuntime = new CacheRuntime(cacheName);
  const idbRuntime = new IdbRuntime(dbName);
  const swRuntime = new SwRuntime(cacheRuntime, idbRuntime);
  let emroute = null;
  async function getEmroute() {
    if (emroute)
      return emroute;
    emroute = await Emroute.create({
      spa: options.spa ?? "only",
      ...options.basePath ? { basePath: options.basePath } : {},
      ...options.title ? { title: options.title } : {},
      ...options.markdownRenderer ? { markdownRenderer: options.markdownRenderer } : {},
      ...options.extendContext ? { extendContext: options.extendContext } : {}
    }, swRuntime);
    return emroute;
  }
  self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
      if (precache.length > 0) {
        const cache = await caches.open(cacheName);
        await Promise.all(precache.map(async (path) => {
          try {
            const response = await fetch(`${origin}${path}`);
            if (response.ok) {
              await cache.put(new Request(`https://emroute-cache${path}`), response);
            }
          } catch {
            console.error(`[emroute-sw] Failed to precache asset: ${path}`);
          }
        }));
      }
      if (content.length > 0) {
        await Promise.all(content.map(async (path) => {
          try {
            const response = await fetch(`${origin}${path}`);
            if (response.ok) {
              const data = new Uint8Array(await response.arrayBuffer());
              await idbRuntime.handle(path, {
                method: "PUT",
                body: data
              });
            }
          } catch {
            console.error(`[emroute-sw] Failed to precache content: ${path}`);
          }
        }));
      }
      await self.skipWaiting();
    })());
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== cacheName && key.startsWith("emroute")).map((key) => caches.delete(key)));
      await self.clients.claim();
    })());
  });
  self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin)
      return;
    event.respondWith(handleFetch(event.request, url));
  });
  async function handleFetch(request, url) {
    if (request.mode === "navigate") {
      try {
        const server = await getEmroute();
        const response = await server.handleRequest(request);
        if (response)
          return response;
      } catch (e) {
        console.error("[emroute-sw] Navigation error:", e);
      }
    }
    const cached = await swRuntime.handle(url.pathname);
    if (cached.status !== 404)
      return cached;
    try {
      return await fetch(request);
    } catch {
      return new Response("Offline", { status: 503 });
    }
  }
}
// dist/src/widget/page-title.widget.js
class PageTitleWidget extends WidgetComponent {
  name = "page-title";
  getData(args) {
    return Promise.resolve({ title: args.params.title });
  }
  renderHTML(args) {
    const title = args.data?.title ?? args.params.title;
    if (title && typeof document !== "undefined") {
      document.title = title;
    }
    return "";
  }
  renderMarkdown(_args) {
    return "";
  }
  validateParams(params) {
    if (!params.title || typeof params.title !== "string") {
      return 'page-title widget requires a "title" string param';
    }
    return;
  }
}
// dist/src/widget/breadcrumb.widget.js
var DEFAULT_HTML_SEPARATOR = " › ";
var DEFAULT_MD_SEPARATOR = " > ";

class BreadcrumbWidget extends WidgetComponent {
  name = "breadcrumb";
  getData(args) {
    const pathname = args.context.pathname || "/";
    const parts = pathname.split("/").filter(Boolean);
    const segments = [
      { label: "Home", href: "/" }
    ];
    let accumulated = "";
    for (const part of parts) {
      accumulated += "/" + part;
      segments.push({
        label: part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, " "),
        href: accumulated
      });
    }
    return Promise.resolve({ segments });
  }
  renderHTML(args) {
    if (!args.data || args.data.segments.length === 0)
      return "";
    const sep = args.params.separator ?? DEFAULT_HTML_SEPARATOR;
    const segments = args.data.segments;
    const items = segments.map((seg, i) => {
      const escaped = escapeHtml(seg.label);
      if (i === segments.length - 1) {
        return `<span aria-current="page">${escaped}</span>`;
      }
      return `<a href="${escapeHtml(seg.href)}">${escaped}</a>`;
    });
    return `<nav aria-label="Breadcrumb">${items.join(escapeHtml(sep))}</nav>`;
  }
  renderMarkdown(args) {
    if (!args.data || args.data.segments.length === 0)
      return "";
    const sep = args.params.separator ?? DEFAULT_MD_SEPARATOR;
    return args.data.segments.map((seg, i, arr) => i === arr.length - 1 ? `**${seg.label}**` : `[${seg.label}](${seg.href})`).join(sep);
  }
}
// dist/src/renderer/spa/mod.js
if (globalThis.customElements) {
  if (!customElements.get("router-slot"))
    customElements.define("router-slot", RouterSlot);
  if (!customElements.get("mark-down"))
    customElements.define("mark-down", MarkdownElement);
}
export {
  setLogger,
  scopeWidgetCss,
  escapeHtml,
  createOverlayService,
  createEmrouteSW,
  createEmrouteApp,
  bootEmrouteApp,
  WidgetComponent,
  RouterSlot,
  RouteTrie,
  PageTitleWidget,
  PageComponent,
  MarkdownElement,
  IdbRuntime,
  FetchRuntime,
  EmrouteApp,
  Emroute,
  DEFAULT_BASE_PATH,
  ComponentElement,
  Component,
  CacheRuntime,
  BreadcrumbWidget
};

//# debugId=FEF92BBA44A02CF764756E2164756E21
//# sourceMappingURL=emroute.js.map
