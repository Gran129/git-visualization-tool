import esbuild from "esbuild";

const importMetaUrlBanner = 'var import_meta_url = require("node:url").pathToFileURL(__filename).href;';

await esbuild.build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
  banner: { js: importMetaUrlBanner },
  define: { "import.meta.url": "import_meta_url" },
});

await esbuild.build({
  entryPoints: ["electron/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/preload.cjs",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
});
