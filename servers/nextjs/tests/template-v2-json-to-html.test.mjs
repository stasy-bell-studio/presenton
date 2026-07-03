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

async function loadRenderer() {
  const outDir = await mkdtemp(path.join(tmpdir(), "template-v2-html-test-"));
  const outfile = path.join(outDir, "renderer.mjs");

  await build({
    entryPoints: [path.join(projectRoot, "lib", "template-v2-json-to-html.ts")],
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

const rendererPromise = loadRenderer();

test("renders icon mask asset URLs without breaking the style attribute", async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    env: {},
    location: {
      origin: "http://presenton.test",
      search: "",
    },
  };

  try {
    const { templateV2UiToHtmlFragment } = await rendererPromise;
    const html = templateV2UiToHtmlFragment({
      background: "#000000",
      elements: [
        {
          type: "image",
          data: "app_data/pptx-to-json/session/images/freeform_14.svg",
          color: "#FFFFFF",
          isIcon: true,
          fit: "fill",
          position: { x: 0, y: 0 },
          size: { width: 16, height: 16 },
        },
      ],
    });

    assert.ok(html);
    assert.match(
      html,
      /-webkit-mask:url\('\/app_data\/pptx-to-json\/session\/images\/freeform_14\.svg'\) center\/100% 100% no-repeat/
    );
    assert.match(
      html,
      /mask:url\('\/app_data\/pptx-to-json\/session\/images\/freeform_14\.svg'\) center\/100% 100% no-repeat/
    );
    assert.equal(html.includes("center/fill"), false);
    assert.match(html, /color:#FFFFFF;background:currentColor/);
    assert.equal(html.includes("background:#FFFFFF"), false);
    assert.equal(html.includes('url("/app_data/'), false);
    assert.equal(html.includes('app_data=""'), false);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});
