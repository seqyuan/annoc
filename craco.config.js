// CRACO config to enable SharedArrayBuffer via COOP/COEP headers
// Required for scran.js WebAssembly with multi-threading
const path = require("path");
const fs = require("fs");

const certDir = path.join(__dirname, ".cert");
const hasCert =
  fs.existsSync(path.join(certDir, "cert.pem")) &&
  fs.existsSync(path.join(certDir, "key.pem"));

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Increase workbox precache size limit to 10MB to handle large WASM bundles
      const workboxPlugin = webpackConfig.plugins.find(
        (p) => p.constructor && p.constructor.name === "GenerateSW"
      );
      if (workboxPlugin) {
        workboxPlugin.config = workboxPlugin.config || {};
        workboxPlugin.config.maximumFileSizeToCacheInBytes = 10 * 1024 * 1024;
      }
      return webpackConfig;
    },
  },
  devServer: {
    allowedHosts: "all",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    ...(hasCert && {
      server: {
        type: "https",
        options: {
          key: fs.readFileSync(path.join(certDir, "key.pem")),
          cert: fs.readFileSync(path.join(certDir, "cert.pem")),
        },
      },
    }),
    setupMiddlewares: (middlewares) => {
      middlewares.unshift({
        name: "coop-coep-headers",
        middleware: (req, res, next) => {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          next();
        },
      });
      return middlewares;
    },
  },
};
