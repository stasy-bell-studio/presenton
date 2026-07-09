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

function chartConfigFromHtml(html) {
  const match = /data-chart-config="([^"]+)"/.exec(html ?? "");
  assert.ok(match, "expected rendered HTML to include chart config");
  const json = match[1]
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
  return JSON.parse(json);
}

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

test("renders camelCase image crop scale", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "image",
        data: "https://example.com/image.png",
        fit: "cover",
        cropScale: 2.25,
        focusX: 35,
        focusY: 65,
        position: { x: 0, y: 0 },
        size: { width: 160, height: 90 },
      },
    ],
  });

  assert.ok(html);
  assert.match(html, /overflow:hidden/);
  assert.match(html, /object-fit:cover/);
  assert.match(html, /object-position:35% 65%/);
  assert.match(html, /transform:scale\(2\.25\)/);
  assert.match(html, /transform-origin:35% 65%;/);
  assert.match(
    html,
    /<div style="[^"]*overflow:hidden;"><img alt="" src="https:\/\/example\.com\/image\.png" style="display:block;max-width:none;max-height:none;height:100%;width:100%;object-fit:cover;object-position:35% 65%;transform:scale\(2\.25\);transform-origin:35% 65%;"><\/div>/
  );
});

test("resets global image sizing for positioned images", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "image",
        data: "/static/images/placeholder.jpg",
        fit: "fill",
        position: { x: -133.33, y: -95.16 },
        size: { width: 500.53, height: 750.79 },
      },
    ],
  });

  assert.ok(html);
  assert.match(html, /display:block;max-width:none;max-height:none;object-fit:fill/);
});

test("clips positioned image children that overflow containers", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "container",
        position: { x: 10, y: 10 },
        size: { width: 100, height: 100 },
        child: {
          type: "image",
          data: "https://example.com/photo.jpg",
          position: { x: -20, y: 0 },
          size: { width: 140, height: 100 },
        },
      },
    ],
  });

  assert.ok(html);
  assert.match(html, /justify-content:flex-start;overflow:hidden"><img/);
});

test("matches reference transform order for flipped rotated images", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "image",
        data: "https://example.com/photo.jpg",
        rotation: 30,
        flipH: true,
        position: { x: 0, y: 0 },
        size: { width: 120, height: 80 },
      },
    ],
  });

  assert.ok(html);
  assert.match(html, /transform:rotate\(30deg\) scaleX\(-1\)/);
  assert.doesNotMatch(html, /rotate\(-30deg\)/);
});

test("uses point colors for single-series chart data", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        data: [
          { label: "Growth", value: 42, color: "#111111" },
          { label: "Retention", value: 64, color: "#222222" },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const dataset = config.data.datasets[0];

  assert.deepEqual(config.data.labels, ["Growth", "Retention"]);
  assert.deepEqual(dataset.backgroundColor, ["#111111", "#222222"]);
  assert.equal(dataset.borderColor, "#111111");
});

test("serializes chart data label placement", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        data_labels: "outside",
        data: [
          { label: "Growth", value: 42 },
          { label: "Retention", value: 64 },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const labels = config.options.plugins.presentonDataLabels;

  assert.equal(labels.enabled, true);
  assert.equal(labels.position, "outside");
});

test("serializes legacy boolean chart data labels", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const visibleHtml = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        data_labels: true,
        data: [
          { label: "Growth", value: 42 },
          { label: "Retention", value: 64 },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const visibleLabels =
    chartConfigFromHtml(visibleHtml).options.plugins.presentonDataLabels;

  assert.equal(visibleLabels.enabled, true);
  assert.equal(visibleLabels.position, "top");

  const hiddenHtml = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        data_labels: false,
        data: [
          { label: "Growth", value: 42 },
          { label: "Retention", value: 64 },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const hiddenLabels =
    chartConfigFromHtml(hiddenHtml).options.plugins.presentonDataLabels;

  assert.equal(hiddenLabels.enabled, false);
  assert.equal(hiddenLabels.position, "top");
});

test("serializes one-ended bar radius metadata for vertical bar charts", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        data: [
          { label: "Loss", value: -15 },
          { label: "Growth", value: 42 },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const dataset = config.data.datasets[0];

  assert.deepEqual(dataset.presentonBarRadius, {
    horizontal: false,
    radius: 7,
  });
  assert.equal("borderRadius" in dataset, false);
  assert.equal(dataset.borderSkipped, false);
});

test("serializes one-ended bar radius metadata for horizontal bar charts", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "horizontal_bar",
        data: [
          { label: "Loss", value: -15 },
          { label: "Growth", value: 42 },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const dataset = config.data.datasets[0];

  assert.deepEqual(dataset.presentonBarRadius, {
    horizontal: true,
    radius: 7,
  });
  assert.equal("borderRadius" in dataset, false);
  assert.equal(dataset.borderSkipped, false);
});

test("keeps stacked bar charts on Chart.js skipped-edge radius", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "stacked_bar",
        categories: ["Q1", "Q2"],
        series: [
          { name: "Plan", values: [10, 20] },
          { name: "Actual", values: [12, 24] },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const dataset = config.data.datasets[0];

  assert.equal(dataset.borderRadius, 7);
  assert.equal(dataset.borderSkipped, "start");
  assert.equal("presentonBarRadius" in dataset, false);
});

test("uses legacy seriesColors when chart colors are absent", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bar",
        categories: ["Q1", "Q2"],
        series: [
          { name: "Plan", values: [10, 20] },
          { name: "Actual", values: [12, 24] },
        ],
        seriesColors: ["#AA0000", "#00AA00"],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const [plan, actual] = config.data.datasets;

  assert.equal(plan.backgroundColor, "#AA0000");
  assert.equal(plan.borderColor, "#AA0000");
  assert.equal(actual.backgroundColor, "#00AA00");
  assert.equal(actual.borderColor, "#00AA00");
});

test("renders table as a fixed grid with readable body text", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "table",
        columns: [{ text: "Metric" }, { text: "Value" }],
        rows: [
          [
            {
              text: "Revenue",
              fill: { color: "#111827" },
              font: { color: "#111827" },
            },
            {
              text: "$1.2M",
              fill: { color: "#111827" },
              font: { color: "#111827" },
            },
          ],
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 120 },
      },
    ],
  });

  assert.ok(html);
  assert.match(html, /display:grid/);
  assert.match(html, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /grid-template-rows:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html, /background:#111827/);
  assert.match(html, /<span style="color:#FFFFFF/);
});

test("renders bubble chart object points and formatted scale metadata", async () => {
  const { templateV2UiToHtmlFragment } = await rendererPromise;
  const html = templateV2UiToHtmlFragment({
    background: "#FFFFFF",
    elements: [
      {
        type: "chart",
        chart_type: "bubble",
        categories: ["A", "B"],
        colors: ["#123456"],
        series: [
          {
            name: "Pipeline",
            data: [
              { x: 1, y: 2, r: 6 },
              { x: 3, y: 4, radius: 8 },
            ],
          },
        ],
        position: { x: 0, y: 0 },
        size: { width: 320, height: 180 },
      },
    ],
  });
  const config = chartConfigFromHtml(html);
  const dataset = config.data.datasets[0];

  assert.equal(config.type, "bubble");
  assert.deepEqual(dataset.data, [
    { x: 1, y: 2, r: 6 },
    { x: 3, y: 4, r: 8 },
  ]);
  assert.deepEqual(dataset.borderColor, ["#123456", "#123456"]);
  assert.equal(config.options.scales.x.ticks.presentonFormat, true);
  assert.equal(config.options.scales.y.ticks.presentonFormat, true);
});
