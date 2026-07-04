/**
 * In-page bot stealth patches (plain JS — must not be transpiled by tsx/esbuild).
 * Loaded via new Function() so Puppeteer can inject it without __name helpers.
 */
Object.defineProperty(navigator, "webdriver", { get: () => undefined });

window.chrome = {
  runtime: {
    connect: () => {},
    sendMessage: () => {},
    onMessage: { addListener: () => {}, removeListener: () => {} },
  },
  loadTimes: () => {},
  csi: () => {},
  app: {
    isInstalled: false,
    InstallState: {
      DISABLED: "disabled",
      INSTALLED: "installed",
      NOT_INSTALLED: "not_installed",
    },
    RunningState: {
      CANNOT_RUN: "cannot_run",
      READY_TO_RUN: "ready_to_run",
      RUNNING: "running",
    },
  },
};

Object.defineProperty(navigator, "plugins", {
  get: () => [
    {
      name: "Chrome PDF Plugin",
      filename: "internal-pdf-viewer",
      description: "Portable Document Format",
    },
    {
      name: "Chrome PDF Viewer",
      filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai",
      description: "",
    },
    {
      name: "Native Client",
      filename: "internal-nacl-plugin",
      description: "",
    },
  ],
});

Object.defineProperty(navigator, "languages", {
  get: () => ["en-US", "en"],
});

const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
  parameters.name === "notifications"
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);

const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (parameter) {
  if (parameter === 37445) return "Intel Inc.";
  if (parameter === 37446) return "Intel Iris OpenGL Engine";
  return getParameter.call(this, parameter);
};

Object.defineProperty(navigator, "connection", {
  get: () => ({
    effectiveType: "4g",
    rtt: 100,
    downlink: 10,
    saveData: false,
  }),
});
Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
