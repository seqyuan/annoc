// CRACO config to enable SharedArrayBuffer via COOP/COEP headers
// Required for scran.js WebAssembly with multi-threading
module.exports = {
  devServer: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
};
