import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { build } from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveNextAlias(importPath) {
  const basePath = path.join(projectRoot, importPath.slice(2));
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
    path.join(basePath, "index.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? basePath;
}

async function loadExportHelpers() {
  const outDir = await mkdtemp(path.join(tmpdir(), "export-output-path-test-"));
  const outfile = path.join(outDir, "export-output-path.mjs");

  await build({
    entryPoints: [path.join(projectRoot, "lib", "run-bundled-presentation-export.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    sourcemap: false,
    logLevel: "silent",
    plugins: [
      {
        name: "next-alias",
        setup(builder) {
          builder.onResolve({ filter: /^@\// }, (args) => ({
            path: resolveNextAlias(args.path),
          }));
        },
      },
    ],
  });

  return import(pathToFileURL(outfile).href);
}

const exportHelpersPromise = loadExportHelpers();

test("normalizes Windows drive paths from file URL pathnames", async () => {
  const { normalizeExportFileUrlPathname } = await exportHelpersPromise;

  assert.equal(
    normalizeExportFileUrlPathname(
      "/D:/www/web/presenton/app_data/exports/deck.pdf",
      "win32"
    ),
    "D:/www/web/presenton/app_data/exports/deck.pdf"
  );
});

test("leaves non-Windows drive-looking pathnames unchanged", async () => {
  const { normalizeExportFileUrlPathname } = await exportHelpersPromise;

  assert.equal(
    normalizeExportFileUrlPathname(
      "/D:/www/web/presenton/app_data/exports/deck.pdf",
      "linux"
    ),
    "/D:/www/web/presenton/app_data/exports/deck.pdf"
  );
});

test("does not rewrite app-data-relative file URL pathnames on Windows", async () => {
  const { normalizeExportFileUrlPathname } = await exportHelpersPromise;

  assert.equal(
    normalizeExportFileUrlPathname("/app_data/exports/deck.pdf", "win32"),
    "/app_data/exports/deck.pdf"
  );
});
