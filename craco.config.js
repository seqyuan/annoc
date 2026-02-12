// CRACO config to enable SharedArrayBuffer via COOP/COEP headers
// Required for scran.js WebAssembly with multi-threading
const path = require("path");
const fs = require("fs");

const certDir = path.join(__dirname, ".cert");
const hasCert =
  fs.existsSync(path.join(certDir, "cert.pem")) &&
  fs.existsSync(path.join(certDir, "key.pem"));

module.exports = {
  devServer: {
    allowedHosts: "all",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    // HTTPS enables cross-origin isolation; use .cert/ if available
    ...(hasCert && {
      server: {
        type: "https",
        options: {
          key: fs.readFileSync(path.join(certDir, "key.pem")),
          cert: fs.readFileSync(path.join(certDir, "cert.pem")),
        },
      },
    }),
    // COOP/COEP must run first; unshift ensures they apply to all responses
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
