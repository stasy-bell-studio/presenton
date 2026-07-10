import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { convertTemplate } from "./convert-template.mjs";

test("converts an exported template to the bundled default-template shape", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "template-converter-"));
  const appData = path.join(root, "app_data");
  const inputDirectory = path.join(root, "templates", "modern");
  const input = path.join(inputDirectory, "source.json");
  const output = path.join(inputDirectory, "template.json");
  const image = path.join(appData, "pptx-to-json", "session", "images", "hero.png");
  const preview = path.join(appData, "uploads", "template-previews", "id", "slide_1.png");
  await mkdir(path.dirname(image), { recursive: true });
  await mkdir(path.dirname(preview), { recursive: true });
  await mkdir(inputDirectory, { recursive: true });
  await writeFile(image, "image bytes");
  await writeFile(preview, "preview bytes");
  await writeFile(
    input,
    JSON.stringify({
      id: "modern",
      name: "Modern",
      description: null,
      created_at: "remove only this top-level key",
      merged_components: {
        components: [{ id: "merged", metadata: { created_at: "keep nested" } }],
      },
      layouts: {
        layouts: [
          {
            id: "cover",
            custom_key: "keep me",
            components: [
              {
                elements: [
                  {
                    type: "image",
                    data: "/app_data/pptx-to-json/session/images/hero.png",
                    custom_image_key: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      assets: {
        fonts: { Montserrat: "https://fonts.example/montserrat.css" },
        images: ["/app_data/unused.png"],
        slide_image_urls: [
          "http://127.0.0.1:8000/app_data/uploads/template-previews/id/slide_1.png",
        ],
      },
    }),
  );

  const result = await convertTemplate({ input, output, appData });
  const converted = JSON.parse(await readFile(output, "utf8"));

  assert.deepEqual(Object.keys(converted), [
    "id",
    "name",
    "description",
    "thumbnail",
    "merged_components",
    "layouts",
    "fonts",
  ]);
  assert.equal(converted.description, "");
  assert.equal(converted.thumbnail, "static/thumbnail.png");
  assert.equal(converted.merged_components[0].metadata.created_at, "keep nested");
  assert.equal(converted.layouts[0].custom_key, "keep me");
  assert.equal(converted.layouts[0].components[0].elements[0].custom_image_key, true);
  assert.equal(converted.layouts[0].components[0].elements[0].data, "static/hero.png");
  assert.deepEqual(converted.fonts, {
    Montserrat: "https://fonts.example/montserrat.css",
  });
  assert.equal(
    await readFile(path.join(inputDirectory, "static", "hero.png"), "utf8"),
    "image bytes",
  );
  assert.equal(
    await readFile(path.join(inputDirectory, "static", "thumbnail.png"), "utf8"),
    "preview bytes",
  );
  assert.equal(result.assetCount, 2);
});

test("fails before writing output when a retained asset is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "template-converter-missing-"));
  const input = path.join(root, "source.json");
  const output = path.join(root, "output", "template.json");
  await writeFile(
    input,
    JSON.stringify({
      id: "missing",
      name: "Missing",
      layouts: [
        { components: [{ elements: [{ type: "image", data: "/app_data/no.png" }] }] },
      ],
      merged_components: [],
      assets: { fonts: {} },
    }),
  );

  await assert.rejects(
    convertTemplate({ input, output, appData: path.join(root, "app_data") }),
    /Referenced asset does not exist/,
  );
  await assert.rejects(readFile(output), /ENOENT/);
});
