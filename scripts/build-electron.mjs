import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["electron/main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist-electron/main.cjs",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
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
