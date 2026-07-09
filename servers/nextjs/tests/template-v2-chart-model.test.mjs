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

async function loadChartHelpers() {
  const outDir = await mkdtemp(path.join(tmpdir(), "template-v2-chart-test-"));
  const outfile = path.join(outDir, "chart-helpers.mjs");

  await build({
    stdin: {
      contents: `
        export { rawChartToEditorChart } from "@/components/slide-editor/model/chart-model";
        export { withHash, withoutHash } from "@/components/slide-editor/utils/color";
      `,
      resolveDir: projectRoot,
      loader: "ts",
    },
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

const helpersPromise = loadChartHelpers();

test("normalizes legacy data-only bar charts for editor rendering", async () => {
  const { rawChartToEditorChart } = await helpersPromise;
  const chart = rawChartToEditorChart({
    type: "chart",
    chart_type: "bar",
    title: "Annual Earnings",
    data: [
      { label: "2018", value: 7000, color: "#3A3A3A" },
      { label: "2019", value: 15000, color: "#3A3A3A" },
      { label: "2020", value: 20000, color: "#3A3A3A" },
    ],
  });

  assert.deepEqual(chart.categories, ["2018", "2019", "2020"]);
  assert.deepEqual(chart.series, [
    { name: "Annual Earnings", values: [7000, 15000, 20000] },
  ]);
  assert.deepEqual(
    chart.data.map((item) => ({ label: item.label, value: item.value })),
    [
      { label: "2018", value: 7000 },
      { label: "2019", value: 15000 },
      { label: "2020", value: 20000 },
    ],
  );
  assert.deepEqual(chart.colors, ["#3A3A3A", "#3A3A3A", "#3A3A3A"]);
});

test("normalizes chart data label placement values", async () => {
  const { rawChartToEditorChart } = await helpersPromise;

  assert.equal(
    rawChartToEditorChart({
      type: "chart",
      chart_type: "bar",
      data_labels: "outside",
      data: [{ label: "Q1", value: 10 }],
    }).data_labels,
    "outside",
  );
  assert.equal(
    rawChartToEditorChart({
      type: "chart",
      chart_type: "bar",
      data_labels: true,
      data: [{ label: "Q1", value: 10 }],
    }).data_labels,
    "top",
  );
  assert.equal(
    rawChartToEditorChart({
      type: "chart",
      chart_type: "bar",
      data_labels: false,
      data: [{ label: "Q1", value: 10 }],
    }).data_labels,
    null,
  );
});

test("editor color helpers tolerate missing generated color values", async () => {
  const { withHash, withoutHash } = await helpersPromise;

  assert.equal(withHash(undefined), "#000000");
  assert.equal(withHash(null, "#7F22FE"), "#7F22FE");
  assert.equal(withHash("155DFC"), "#155DFC");
  assert.equal(withHash("#155DFC"), "#155DFC");
  assert.equal(withoutHash(undefined), "");
  assert.equal(withoutHash("#155DFC"), "155DFC");
});
