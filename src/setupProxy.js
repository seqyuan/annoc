// Configure dev server middleware.
// This file is picked up by react-scripts' webpack-dev-server.
//
// - Adds COOP/COEP headers so that SharedArrayBuffer is available
//   (required for scran.js WebAssembly with threads).

module.exports = function (app) {
  // COOP/COEP for SharedArrayBuffer.
  app.use((req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
  });
};

