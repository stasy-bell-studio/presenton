import { resolveBackendAssetUrl } from "@/utils/api";
import { normalizeRawTextMarkdownElement } from "@/components/slide-editor/text/template-v2-text";

type JsonRecord = Record<string, unknown>;
type RenderMode = "absolute" | "flow";
type ChartKind =
  | "bar"
  | "column"
  | "stacked_bar"
  | "stacked_column"
  | "line"
  | "area"
  | "pie"
  | "donut";
type InfographicKind = "progress_bar" | "gauge";

type JsonToHtmlItem = JsonRecord;

interface ChartSeriesData {
  name: string;
  values: number[];
}

interface NormalizedChartData {
  categories: string[];
  pointColors: string[];
  series: ChartSeriesData[];
  seriesColors: string[];
}

interface Box {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface FontFaceDefinition {
  family: string;
  url: string;
  format?: string;
  weight?: string;
  style?: string;
}

interface TemplateV2HtmlOptions {
  fonts?: unknown;
  width?: number;
  height?: number;
}

interface TemplateV2RenderPayload {
  items: JsonToHtmlItem[];
  width: number;
  height: number;
  fonts?: unknown;
  background: string;
}

const ELEMENT_TYPES = new Set([
  "text",
  "container",
  "image",
  "text-list",
  "table",
  "rectangle",
  "ellipse",
  "line",
  "svg",
  "chart",
  "infographic",
  "flex",
  "grid",
  "group",
  "list-view",
  "grid-view",
]);

const DEFAULT_CHART_JS_URL =
  "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js";

const DEFAULT_CHART_COLORS = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#F59E0B",
  "#7C3AED",
  "#0891B2",
  "#DB2777",
  "#65A30D",
];

export const TEMPLATE_V2_HTML_WIDTH = 1280;
export const TEMPLATE_V2_HTML_HEIGHT = 720;

export function templateV2UiToHtml(
  ui: unknown,
  options: TemplateV2HtmlOptions = {}
): string | null {
  const payload = templateV2RenderPayload(ui, options);
  if (!payload) return null;

  return jsonToHtml(
    payload.items,
    payload.width,
    payload.height,
    payload.fonts,
    payload.background
  );
}

export function templateV2UiToHtmlFragment(
  ui: unknown,
  options: TemplateV2HtmlOptions = {}
): string | null {
  const payload = templateV2RenderPayload(ui, options);
  if (!payload) return null;

  return jsonToHtmlFragment(
    payload.items,
    payload.width,
    payload.height,
    payload.fonts,
    payload.background
  );
}

function templateV2RenderPayload(
  ui: unknown,
  options: TemplateV2HtmlOptions
): TemplateV2RenderPayload | null {
  const record = readRecord(ui);
  const rootElements = readArray(record.elements);
  const components = readArray(record.components);
  const items = [...rootElements, ...components].map((item) =>
    readRecord(normalizeTemplateV2AssetUrls(item))
  );

  if (items.length === 0) {
    return null;
  }

  const width = options.width ?? TEMPLATE_V2_HTML_WIDTH;
  const height = options.height ?? TEMPLATE_V2_HTML_HEIGHT;
  const background = normalizeCssColor(readString(record.background) ?? "#FFFFFF");

  return {
    items,
    width,
    height,
    fonts: options.fonts,
    background,
  };
}

export function hasTemplateV2RenderableUi(ui: unknown): boolean {
  const record = readRecord(ui);
  return readArray(record.components).length > 0 || readArray(record.elements).length > 0;
}

function normalizeTemplateV2AssetUrls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeTemplateV2AssetUrls);
  }

  const record = readRecord(value);
  if (!Object.keys(record).length) return value;

  const normalized = Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      normalizeTemplateV2AssetUrls(child),
    ])
  ) as JsonRecord;

  if (readString(normalized.type) === "image") {
    const source = readString(normalized.data);
    if (source) {
      normalized.data = resolveBackendAssetUrl(source);
    }
  }

  return normalized;
}

function jsonToHtml(
  items: JsonToHtmlItem[],
  width: number,
  height: number,
  fonts: unknown = {},
  background = "#FFFFFF"
): string {
  const records = items.map(readRecord);
  const chartScripts = records.some(hasChartItem) ? renderChartScripts() : "";
  const fontAssetTags = renderFontAssetTags(fonts);
  const bg = escapeCssColor(background);
  const slideRoot = renderSlideRoot(records, width, height, bg);

  return `<!doctype html>
<html><head><meta charset="utf-8">${fontAssetTags}<style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${bg}}
body{font-family:Arial,Helvetica,sans-serif}
*,*::before,*::after{box-sizing:border-box}
</style></head><body>${slideRoot}${chartScripts}</body></html>`;
}

function jsonToHtmlFragment(
  items: JsonToHtmlItem[],
  width: number,
  height: number,
  fonts: unknown = {},
  background = "#FFFFFF"
): string {
  const records = items.map(readRecord);
  const bg = escapeCssColor(background);

  return `${renderFontAssetTags(fonts)}${renderSlideRoot(
    records,
    width,
    height,
    bg
  )}`;
}

function renderSlideRoot(
  records: JsonRecord[],
  width: number,
  height: number,
  background: string
): string {
  const content = records.map((item) => renderItem(item, "absolute")).join("");

  return `<div class="relative overflow-hidden" data-template-v2-html-slide="true" style="box-sizing:border-box;position:relative;width:${cssNumber(
    width
  )}px;height:${cssNumber(
    height
  )}px;overflow:hidden;background:${background};font-family:Arial,Helvetica,sans-serif">${content}</div>`;
}

function renderFontAssetTags(fonts: unknown): string {
  const css = readStringValueOrNull(fonts);
  if (css) {
    return `<style>${escapeStyleText(css)}${fontCssFamilyAliases(css)}</style>`;
  }

  const tags: string[] = [];
  const records = readRecord(fonts);
  const embeddedCss = readStringValueOrNull(records.css ?? records.font_css);
  if (embeddedCss) {
    tags.push(
      `<style>${escapeStyleText(embeddedCss)}${fontCssFamilyAliases(embeddedCss)}</style>`
    );
  }

  const faceEntries = readArray(records.fonts).length ? records.fonts : fonts;
  tags.push(...normalizeFontFaces(faceEntries).map(renderFontFaceDefinition));

  const stylesheets = normalizeFontStylesheetUrls(faceEntries);
  tags.push(
    ...stylesheets.map(
      (url) =>
        `<link rel="stylesheet" href="${escapeAttribute(resolveBackendAssetUrl(url))}">`
    )
  );

  return tags.join("");
}

function normalizeFontFaces(fonts: unknown): FontFaceDefinition[] {
  if (Array.isArray(fonts)) {
    return fonts.flatMap((entry) => normalizeFontFaceEntry(undefined, entry));
  }

  return Object.entries(readRecord(fonts)).flatMap(([family, value]) =>
    family === "css" || family === "font_css" || family === "fonts"
      ? []
      : normalizeFontFaceEntry(family, value)
  );
}

function normalizeFontFaceEntry(
  fallbackFamily: string | undefined,
  value: unknown
): FontFaceDefinition[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeFontFaceEntry(fallbackFamily, entry));
  }

  const url = readString(value);
  if (url) {
    if (isFontStylesheetUrl(url)) return [];
    const family = fallbackFamily?.trim();
    return family
      ? [
          {
            family,
            url,
            weight: inferFontWeight(`${family} ${url}`),
            style: inferFontStyle(`${family} ${url}`),
          },
        ]
      : [];
  }

  const record = readRecord(value);
  const family = readString(
    record.family ?? record.name ?? record.fontFamily ?? record.font_family
  ) ?? fallbackFamily?.trim();
  const source = readString(
    record.url ?? record.src ?? record.href ?? record.data ?? record.source
  );
  if (!family || !source || isFontStylesheetUrl(source)) return [];

  return [
    {
      family,
      url: source,
      format: readString(record.format) ?? undefined,
      weight:
        readFontWeight(record.weight ?? record.fontWeight ?? record.font_weight) ??
        inferFontWeight(`${family} ${source}`),
      style:
        readFontStyle(record.style ?? record.fontStyle ?? record.font_style) ??
        inferFontStyle(`${family} ${source}`),
    },
  ];
}

function normalizeFontStylesheetUrls(fonts: unknown): string[] {
  if (Array.isArray(fonts)) {
    return fonts.flatMap(normalizeFontStylesheetUrls);
  }

  const directUrl = readString(fonts);
  if (directUrl && isFontStylesheetUrl(directUrl)) return [directUrl];

  return Object.values(readRecord(fonts)).flatMap((value) => {
    const url = readString(value);
    if (url && isFontStylesheetUrl(url)) return [url];

    const record = readRecord(value);
    const source = readString(
      record.url ?? record.src ?? record.href ?? record.data ?? record.source
    );
    return source && isFontStylesheetUrl(source) ? [source] : [];
  });
}

function renderFontFaceDefinition(definition: FontFaceDefinition): string {
  const aliases = fontFamilyAliases(definition.family, definition.weight);
  const src = `url("${escapeCssUrl(resolveBackendAssetUrl(definition.url))}")${
    definition.format ? ` format("${escapeCssUrl(definition.format)}")` : ""
  }`;
  return aliases
    .map(
      (family) =>
        `<style>@font-face{font-family:${escapeCssFont(
          family
        )};src:${src};font-weight:${definition.weight ?? "400"};font-style:${
          definition.style ?? "normal"
        };font-display:swap}</style>`
    )
    .join("");
}

function fontCssFamilyAliases(css: string): string {
  const aliases: string[] = [];
  const facePattern = /@font-face\s*\{[^}]*font-family\s*:\s*(['"]?)([^;'"}]+)\1[^}]*\}/gi;
  for (const match of css.matchAll(facePattern)) {
    const block = match[0];
    const family = match[2]?.trim();
    if (!family) continue;
    const weight = /font-weight\s*:\s*([^;}]+)/i.exec(block)?.[1]?.trim();
    for (const alias of fontFamilyAliases(family, weight).filter(
      (item) => item !== family
    )) {
      aliases.push(
        block.replace(
          /font-family\s*:\s*(['"]?)([^;'"}]+)\1/i,
          `font-family:${escapeCssFont(alias)}`
        )
      );
    }
  }
  return aliases.join("");
}

function fontFamilyAliases(family: string, weight?: string): string[] {
  const normalized = family.trim();
  const aliases = new Set([normalized]);
  const alias = normalized
    .replace(/\s+(regular|bold\s*italic|bold|italic|black|semibold|semi\s*bold|medium|light)$/i, "")
    .trim();

  if (alias && alias !== normalized && (weight || inferFontWeight(normalized))) {
    aliases.add(alias);
  }

  return [...aliases];
}

function renderItem(item: JsonRecord, mode: RenderMode): string {
  if (isComponent(item)) {
    return renderGroup({ ...item, type: "group", children: item.elements }, mode);
  }

  switch (readString(item.type)) {
    case "rectangle":
      return `<div style="${frameAndBoxStyle(item, mode)}"></div>`;
    case "ellipse":
      return `<div style="${frameAndBoxStyle(item, mode, "border-radius:50%")}"></div>`;
    case "line":
      return renderLine(item, mode);
    case "svg":
      return renderSvg(item, mode);
    case "image":
      return renderImage(item, mode);
    case "text":
      return renderText(item, mode);
    case "text-list":
      return renderTextList(item, mode);
    case "table":
      return renderTable(item, mode);
    case "container":
      return renderContainer(item, mode);
    case "flex":
    case "list-view":
      return renderFlex(item, mode);
    case "grid":
    case "grid-view":
      return renderGrid(item, mode);
    case "group":
      return renderGroup(item, mode);
    case "chart":
      return renderChart(item, mode);
    case "infographic":
      return renderInfographic(item, mode);
    default:
      if (Array.isArray(item.children)) return renderGroup(item, mode);
      if (readRecordOrNull(item.child)) return renderContainer(item, mode);
      return "";
  }
}

function renderImage(item: JsonRecord, mode: RenderMode): string {
  const source = readString(item.data);
  if (!source) return "";
  const clipPathStyle = imageClipPathStyle(item);
  const color = normalizeChartColor(readString(item.color));
  if (color && readBoolean(item.isIcon ?? item.is_icon)) {
    const maskUrl = cssUrl(source);
    const maskSize = imageMaskSize(item.fit);
    return `<div style="${frameStyle(item, mode)}${boxStyle(
      item
    )}${clipPathStyle}color:${escapeCssColor(
      color
    )};background:currentColor;-webkit-mask:${maskUrl} center/${maskSize} no-repeat;mask:${maskUrl} center/${maskSize} no-repeat;"></div>`;
  }
  return `<img alt="" src="${escapeAttribute(source)}" style="${frameStyle(
    item,
    mode
  )}${boxStyle(item)}${clipPathStyle}display:block;object-fit:${imageFit(
    item.fit
  )};${imageFocusStyle(item)}">`;
}

function renderText(item: JsonRecord, mode: RenderMode): string {
  const font = readRecord(item.font);
  const alignment = readRecord(item.alignment);
  const horizontal = readString(alignment.horizontal);
  const vertical = readString(alignment.vertical);
  const runs = normalizedRunsForHtml(item, font);
  const runHtml = runs
    .map((run) => {
      const runFont = { ...font, ...readRecord(run.font) };
      return `<span style="${fontStyle(runFont)}">${escapeHtml(
        readStringValue(run.text)
      )}</span>`;
    })
    .join("");

  return `<div style="${frameStyle(item, mode)}${transformStyle(item)}${fontStyle(font)}display:flex;align-items:${verticalAlign(
    vertical
  )};justify-content:${horizontalAlign(horizontal)};line-height:${cssNumber(
    readNumber(font.lineHeight ?? font.line_height) ?? 1.1
  )};${textOverflowStyle()}text-align:${textAlign(horizontal)};"><span style="display:block;width:100%">${runHtml}</span></div>`;
}

function renderTextList(item: JsonRecord, mode: RenderMode): string {
  const marker = readString(item.marker);
  const tag = marker === "number" ? "ol" : "ul";
  const font = readRecord(item.font);
  const entries = readArray(item.items)
    .map((entry) => {
      const runs = normalizedListRunsForHtml(entry, font);
      const html = runs
        .map(
          (run) =>
            `<span style="${fontStyle({
              ...font,
              ...readRecord(run.font),
            })}">${escapeHtml(readStringValue(run.text))}</span>`
        )
        .join("");
      return `<li style="${textOverflowStyle()}">${html}</li>`;
    })
    .join("");
  const listStyle = `margin:0;padding-left:${marker === "none" ? 0 : 24}px;${
    marker === "none" ? "list-style-type:none;" : ""
  }`;

  return `<div style="${frameStyle(item, mode)}${transformStyle(item)}${fontStyle(
    font
  )}${textOverflowStyle()}"><${tag} style="${listStyle}">${entries}</${tag}></div>`;
}

function renderTable(item: JsonRecord, mode: RenderMode): string {
  const columns = readArray(item.columns);
  const rows = readArray(item.rows);
  const header = columns.length
    ? `<thead><tr>${columns
        .map((cell) => `<th style="${tableCellStyle(cell, true)}">${cellText(cell)}</th>`)
        .join("")}</tr></thead>`
    : "";
  const body = rows
    .map(
      (row) =>
        `<tr>${readArray(row)
          .map((cell) => `<td style="${tableCellStyle(cell, false)}">${cellText(cell)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<div style="${frameStyle(
    item,
    mode
  )}${transformStyle(item)}overflow:hidden"><table style="border-collapse:collapse;height:100%;table-layout:fixed;width:100%">${header}<tbody>${body}</tbody></table></div>`;
}

function renderContainer(item: JsonRecord, mode: RenderMode): string {
  const child = readRecordOrNull(item.child);
  const alignment = readRecord(item.alignment);
  const style = `${frameStyle(item, mode)}${boxStyle(item)}${paddingStyle(
    readRecord(item.padding)
  )}display:flex;align-items:${verticalAlign(
    readString(alignment.vertical)
  )};justify-content:${horizontalAlign(
    readString(alignment.horizontal)
  )};overflow:visible`;
  return `<div style="${style}">${
    child ? renderItem(child, readRecordOrNull(child.position) ? "absolute" : "flow") : ""
  }</div>`;
}

function renderFlex(item: JsonRecord, mode: RenderMode): string {
  const direction = readString(item.direction) === "row" ? "row" : "column";
  const children = readLayoutChildren(item)
    .map((child) => renderItem(readRecord(child), "flow"))
    .join("");
  const gap = readNumber(item.gap) ?? 0;
  const style = `${frameStyle(item, mode)}${boxStyle(item)}${paddingStyle(
    readRecord(item.padding)
  )}display:flex;flex-direction:${direction};flex-wrap:${readBoolean(item.wrap) ? "wrap" : "nowrap"};align-items:${cssAlignment(
    readString(item.alignItems ?? item.align_items),
    "stretch"
  )};justify-content:${cssAlignment(
    readString(item.justifyContent ?? item.justify_content),
    "flex-start"
  )};gap:${cssNumber(gap)}px;column-gap:${cssNumber(
    readNumber(item.columnGap ?? item.column_gap) ?? gap
  )}px;row-gap:${cssNumber(
    readNumber(item.rowGap ?? item.row_gap) ?? gap
  )}px;overflow:visible`;
  return `<div style="${style}">${children}</div>`;
}

function renderGrid(item: JsonRecord, mode: RenderMode): string {
  const columns = Math.max(1, Math.floor(readNumber(item.columns) ?? 1));
  const rows = readNumber(item.rows);
  const gap = readNumber(item.gap) ?? 0;
  const children = readLayoutChildren(item)
    .map((child) => renderItem(readRecord(child), "flow"))
    .join("");
  const style = `${frameStyle(item, mode)}${boxStyle(item)}${paddingStyle(
    readRecord(item.padding)
  )}display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));${
    rows ? `grid-template-rows:repeat(${Math.max(1, Math.floor(rows))},minmax(0,1fr));` : ""
  }align-items:${cssAlignment(
    readString(item.alignItems ?? item.align_items),
    "stretch"
  )};justify-items:${cssAlignment(
    readString(item.justifyItems ?? item.justify_items),
    "stretch"
  )};column-gap:${cssNumber(
    readNumber(item.columnGap ?? item.column_gap) ?? gap
  )}px;row-gap:${cssNumber(
    readNumber(item.rowGap ?? item.row_gap) ?? gap
  )}px;overflow:visible`;
  return `<div style="${style}">${children}</div>`;
}

function readLayoutChildren(item: JsonRecord): unknown[] {
  const children = readArray(item.children);
  if (children.length) return children;

  const elements = readArray(item.elements);
  if (elements.length) return elements;

  const child = readRecordOrNull(item.item);
  const count = Math.max(0, Math.floor(readNumber(item.count) ?? 0));
  return child && count ? Array.from({ length: count }, () => child) : [];
}

function renderGroup(item: JsonRecord, mode: RenderMode): string {
  const children = readArray(item.children).map(readRecord);
  const content = children.map((child) => renderItem(child, "absolute")).join("");
  return `<div style="${frameStyle(item, mode, childrenBounds(children))}${boxStyle(
    item
  )}overflow:visible">${content}</div>`;
}

function renderLine(item: JsonRecord, mode: RenderMode): string {
  const box = readBox(item);
  const stroke = readRecord(item.stroke);
  const color = colorWithOpacity(
    readString(stroke.color) ?? "#000000",
    readNumber(stroke.opacity)
  );
  const width = Math.max(0, readNumber(stroke.width) ?? 1);
  const dash = readArray(stroke.dash)
    .map(readNumber)
    .filter((value): value is number => value != null)
    .join(" ");
  return `<div style="${frameStyle(item, mode)}${transformStyle(item)}overflow:visible"><svg width="100%" height="100%" viewBox="0 0 ${cssNumber(
    box.width ?? 1
  )} ${cssNumber(box.height ?? 1)}" preserveAspectRatio="none" style="display:block;overflow:visible"><line x1="0" y1="0" x2="${cssNumber(
    box.width ?? 1
  )}" y2="${cssNumber(box.height ?? 1)}" stroke="${escapeAttribute(
    color
  )}" stroke-width="${cssNumber(width)}"${dash ? ` stroke-dasharray="${dash}"` : ""}/></svg></div>`;
}

function renderSvg(item: JsonRecord, mode: RenderMode): string {
  const svg = readStringValue(item.svg);
  if (!svg) return "";
  return `<div style="${frameStyle(item, mode)}${transformStyle(
    item
  )}overflow:hidden">${svg}</div>`;
}

function renderChart(item: JsonRecord, mode: RenderMode): string {
  const box = readBox(item);
  const width = Math.max(1, box.width ?? 1);
  const height = Math.max(1, box.height ?? 1);
  const config = chartConfig(item);

  return `<div style="${frameStyle(item, mode)}${transformStyle(
    item
  )}overflow:hidden"><canvas data-presenton-chart="true" data-chart-config="${escapeAttribute(
    JSON.stringify(config)
  )}" width="${cssNumber(Math.round(width))}" height="${cssNumber(
    Math.round(height)
  )}" style="display:block;width:100%;height:100%"></canvas></div>`;
}

function renderInfographic(item: JsonRecord, mode: RenderMode): string {
  const kind = infographicKindFromValue(
    readString(item.infographicType ?? item.infographic_type)
  );
  if (kind === "gauge") return renderGaugeInfographic(item, mode);
  return renderProgressBarInfographic(item, mode);
}

function renderProgressBarInfographic(item: JsonRecord, mode: RenderMode): string {
  const metrics = infographicMetrics(item);
  const highlightColor = infographicHighlightColor(item);
  const baseColor = infographicBaseColor(item);
  const fallbackSize = { width: 180, height: 40 };
  const box = readBox(item, fallbackSize);
  const showLabel = (box.height ?? fallbackSize.height) >= 28;
  const label = showLabel
    ? `<div style="color:#111827;font-size:${cssNumber(
        Math.max(
          10,
          Math.min(16, Math.round((box.height ?? fallbackSize.height) * 0.3))
        )
      )}px;font-weight:700;line-height:1;text-align:right">${escapeHtml(
        metrics.label
      )}</div>`
    : "";

  return `<div style="${frameStyle(item, mode, fallbackSize)}${transformStyle(
    item
  )}display:flex;flex-direction:column;gap:6px;justify-content:center;overflow:hidden"><div style="position:relative;width:100%;height:${cssNumber(
    Math.max(
      6,
      Math.min(18, Math.round((box.height ?? fallbackSize.height) * 0.35))
    )
  )}px;border-radius:999px;background:${escapeCssColor(
    baseColor
  )};overflow:hidden"><div style="height:100%;width:${cssNumber(
    metrics.ratio * 100
  )}%;border-radius:inherit;background:${escapeCssColor(highlightColor)}"></div></div>${label}</div>`;
}

function renderGaugeInfographic(item: JsonRecord, mode: RenderMode): string {
  const metrics = infographicMetrics(item);
  const highlightColor = infographicHighlightColor(item);
  const baseColor = infographicBaseColor(item);
  const fallbackSize = { width: 160, height: 96 };
  const progressPath =
    metrics.ratio > 0
      ? `<path d="${escapeAttribute(
          describeGaugeArc(60, 60, 48, metrics.ratio)
        )}" fill="none" stroke="${escapeAttribute(
          escapeCssColor(highlightColor)
        )}" stroke-width="12" stroke-linecap="round"/>`
      : "";

  return `<div style="${frameStyle(item, mode, fallbackSize)}${transformStyle(
    item
  )}overflow:hidden"><svg width="100%" height="100%" viewBox="0 0 120 72" preserveAspectRatio="xMidYMid meet" style="display:block"><path d="M 12 60 A 48 48 0 0 1 108 60" fill="none" stroke="${escapeAttribute(
    escapeCssColor(baseColor)
  )}" stroke-width="12" stroke-linecap="round"/>${progressPath}<text x="60" y="52" text-anchor="middle" fill="#111827" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700">${escapeHtml(
    metrics.label
  )}</text></svg></div>`;
}

function chartConfig(item: JsonRecord): JsonRecord {
  const chartKind = chartKindFromValue(readString(item.chartType ?? item.chart_type));
  const data = normalizeChartData(item);
  const title = readString(item.title);
  const font = readRecord(item.font);
  const labelColor =
    normalizeChartColor(readString(item.labelColor ?? item.label_color)) ??
    "#374151";
  const axisColor =
    normalizeChartColor(readString(item.axisColor ?? item.axis_color)) ??
    labelColor;
  const dataLabelsColor =
    normalizeChartColor(
      readString(item.dataLabelsColor ?? item.data_labels_color)
    ) ?? axisColor;
  const titleColor =
    normalizeChartColor(readString(item.titleColor ?? item.title_color)) ??
    "#111827";
  const gridColor =
    normalizeChartColor(readString(item.gridColor ?? item.grid_color)) ??
    "#E5E7EB";
  const fontFamily = readString(font.family) ?? "Arial, Helvetica, sans-serif";
  const showLegend =
    chartKind === "pie" || chartKind === "donut" || data.series.length > 1;
  const dataLabels = readOptionalBoolean(
    item.dataLabels ?? item.data_labels,
    false
  );
  const config: JsonRecord = {
    type: chartJsType(chartKind),
    data: {
      labels: data.categories,
      datasets: chartDatasets(chartKind, data),
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      plugins: {
        legend: {
          display: showLegend,
          position: "bottom",
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            color: axisColor,
            font: { family: fontFamily, size: 11 },
          },
        },
        title: {
          display: Boolean(title),
          text: title ?? "",
          color: titleColor,
          font: {
            family: fontFamily,
            size: Math.max(12, readNumber(font.size) ?? 16),
            weight: "700",
          },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
        presentonDataLabels: {
          enabled: dataLabels,
          color: dataLabelsColor,
          fontFamily,
          fontSize: Math.max(10, Math.min(14, readNumber(font.size) ?? 11)),
        },
      },
    },
  };

  if (chartKind === "donut") {
    readRecord(config.options).cutout = "58%";
  } else if (chartKind === "pie") {
    readRecord(config.options).cutout = "0%";
  } else {
    const stacked =
      chartKind === "stacked_bar" || chartKind === "stacked_column";
    const horizontal = chartKind === "bar" || chartKind === "stacked_bar";
    if (horizontal) {
      readRecord(config.options).indexAxis = "y";
    }
    readRecord(config.options).scales = {
      x: {
        display: readOptionalBoolean(item.xAxis ?? item.x_axis, true),
        stacked,
        beginAtZero: horizontal,
        grid: { display: false },
        title: {
          display: Boolean(readString(item.xAxisTitle ?? item.x_axis_title)),
          text: readString(item.xAxisTitle ?? item.x_axis_title) ?? "",
          color: axisColor,
          font: { family: fontFamily, size: 11, weight: "600" },
        },
        ticks: {
          color: axisColor,
          font: { family: fontFamily, size: 11 },
          maxRotation: 0,
          autoSkip: true,
        },
      },
      y: {
        display: readOptionalBoolean(item.yAxis ?? item.y_axis, true),
        beginAtZero: true,
        stacked,
        grid: {
          display: readOptionalBoolean(item.grid, false),
          color: gridColor,
        },
        title: {
          display: Boolean(readString(item.yAxisTitle ?? item.y_axis_title)),
          text: readString(item.yAxisTitle ?? item.y_axis_title) ?? "",
          color: axisColor,
          font: { family: fontFamily, size: 11, weight: "600" },
        },
        ticks: {
          color: axisColor,
          font: { family: fontFamily, size: 11 },
        },
      },
    };
  }

  return config;
}

function chartDatasets(chartKind: ChartKind, data: NormalizedChartData): JsonRecord[] {
  if (chartKind === "pie" || chartKind === "donut") {
    return data.series.map((series) => ({
      label: series.name,
      data: series.values.map((value) => Math.max(0, value)),
      backgroundColor: series.values.map(
        (_, index) =>
          data.pointColors[index] ??
          data.seriesColors[index] ??
          DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]
      ),
      borderColor: "#FFFFFF",
      borderWidth: 2,
      hoverOffset: 0,
    }));
  }

  const lineLike = chartKind === "line" || chartKind === "area";

  return data.series.map((series, index) => {
    const color =
      data.seriesColors[index] ??
      data.pointColors[index] ??
      DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length];
    const dataset: JsonRecord = {
      label: series.name,
      data: series.values,
      backgroundColor:
        data.series.length === 1 && data.pointColors.length
          ? data.pointColors
          : lineLike
            ? colorWithOpacity(color, 0.16)
            : color,
      borderColor: color,
      borderWidth: lineLike ? 3 : 0,
    };

    if (lineLike) {
      dataset.fill = chartKind === "area";
      dataset.pointRadius = 3;
      dataset.pointHoverRadius = 3;
      dataset.tension = 0.35;
    }

    return dataset;
  });
}

function normalizeChartData(item: JsonRecord): NormalizedChartData {
  const points = readArray(item.data)
    .map(readRecord)
    .map((point, index) => {
      const value = readNumber(point.value);
      if (value == null) return null;
      return {
        label: readString(point.label) ?? `Value ${index + 1}`,
        value,
        color: normalizeChartColor(readString(point.color)),
      };
    })
    .filter(
      (
        point
      ): point is { label: string; value: number; color: string | null } =>
        Boolean(point)
    );
  const series = readArray(item.series)
    .map(readRecord)
    .map((series, index) => ({
      name: readString(series.name) ?? `Series ${index + 1}`,
      values: readArray(series.values).map(
        (value) => readNumber(value) ?? 0
      ),
    }))
    .filter((series) => series.values.length);
  if (!series.length && points.length) {
    series.push({
      name: readString(item.title) ?? "Series 1",
      values: points.map((point) => point.value),
    });
  }
  const maxLength = Math.max(0, ...series.map((item) => item.values.length));
  const categoryValues = readArray(item.categories);
  const categories = normalizeCategories(
    categoryValues.length ? categoryValues : points.map((point) => point.label),
    maxLength
  );
  const seriesColors = readColorArray(item.seriesColors ?? item.series_colors);

  return {
    categories,
    pointColors: points
      .map((point) => point.color)
      .filter((color): color is string => Boolean(color)),
    series: series.map((item) => ({
      ...item,
      values: padValues(item.values, categories.length),
    })),
    seriesColors:
      seriesColors.length > 0
        ? seriesColors
        : [normalizeChartColor(readString(item.color)) ?? DEFAULT_CHART_COLORS[0]],
  };
}

function normalizeCategories(values: unknown[], length: number): string[] {
  return Array.from({ length }, (_, index) => {
    const value = values[index];
    return readStringValue(value) || `Value ${index + 1}`;
  });
}

function padValues(values: number[], length: number): number[] {
  return Array.from({ length }, (_, index) => values[index] ?? 0);
}

function readColorArray(value: unknown): string[] {
  return readArray(value)
    .map((item) => normalizeChartColor(readString(item)))
    .filter((color): color is string => Boolean(color));
}

function normalizeChartColor(value: string | null): string | null {
  if (!value) return null;
  return normalizeCssColor(value);
}

function chartKindFromValue(value: string | null): ChartKind {
  if (value === "column") return "column";
  if (value === "stacked_bar") return "stacked_bar";
  if (value === "stacked_column") return "stacked_column";
  if (value === "line") return "line";
  if (value === "area") return "area";
  if (value === "pie") return "pie";
  if (value === "donut" || value === "doughnut") return "donut";
  return "bar";
}

function chartJsType(chartKind: ChartKind): string {
  if (chartKind === "donut") return "doughnut";
  if (chartKind === "area") return "line";
  if (
    chartKind === "column" ||
    chartKind === "stacked_bar" ||
    chartKind === "stacked_column"
  ) {
    return "bar";
  }
  return chartKind;
}

interface InfographicMetrics {
  ratio: number;
  label: string;
}

function infographicKindFromValue(value: string | null): InfographicKind {
  return value === "gauge" ? "gauge" : "progress_bar";
}

function infographicMetrics(item: JsonRecord): InfographicMetrics {
  const rawMin = readNumber(item.minValue ?? item.min_value) ?? 0;
  const rawMax = readNumber(item.maxValue ?? item.max_value) ?? 100;
  const min = Math.min(rawMin, rawMax);
  const max = Math.max(rawMin, rawMax);
  const value = clamp(readNumber(item.value) ?? min, min, max);
  const ratio = max === min ? 0 : (value - min) / (max - min);

  return {
    ratio,
    label: formatInfographicNumber(value),
  };
}

function infographicHighlightColor(item: JsonRecord): string {
  const fill = readRecord(item.fill);
  return (
    normalizeChartColor(
      readString(
        item.highlightColor ?? item.highlight_color ?? item.color ?? fill.color
      )
    ) ??
    DEFAULT_CHART_COLORS[0]
  );
}

function infographicBaseColor(item: JsonRecord): string {
  return (
    normalizeChartColor(readString(item.baseColor ?? item.base_color)) ??
    "#E5E7EB"
  );
}

function describeGaugeArc(
  centerX: number,
  centerY: number,
  radius: number,
  ratio: number
): string {
  const start = gaugePoint(centerX, centerY, radius, 180);
  const end = gaugePoint(
    centerX,
    centerY,
    radius,
    180 + clamp(ratio, 0, 1) * 180
  );
  return `M ${cssNumber(start.x)} ${cssNumber(start.y)} A ${cssNumber(
    radius
  )} ${cssNumber(radius)} 0 0 1 ${cssNumber(end.x)} ${cssNumber(end.y)}`;
}

function gaugePoint(
  centerX: number,
  centerY: number,
  radius: number,
  angleDegrees: number
): { x: number; y: number } {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function formatInfographicNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readOptionalBoolean(value: unknown, fallback: boolean): boolean {
  return value == null ? fallback : readBoolean(value);
}

function hasChartItem(item: JsonRecord): boolean {
  if (isComponent(item)) {
    return readArray(item.elements).map(readRecord).some(hasChartItem);
  }

  if (readString(item.type) === "chart") return true;
  if (Array.isArray(item.children)) {
    return readArray(item.children).map(readRecord).some(hasChartItem);
  }

  if (Array.isArray(item.elements)) {
    return readArray(item.elements).map(readRecord).some(hasChartItem);
  }

  const child = readRecordOrNull(item.child);
  if (child) return hasChartItem(child);

  const itemChild = readRecordOrNull(item.item);
  return itemChild ? hasChartItem(itemChild) : false;
}

function renderChartScripts(): string {
  const chartJsUrl =
    process.env.NEXT_PUBLIC_CHART_JS_URL ||
    process.env.CHART_JS_URL ||
    DEFAULT_CHART_JS_URL;
  return `<script src="${escapeAttribute(chartJsUrl)}"></script><script>${escapeScriptText(
    chartRendererScript()
  )}</script>`;
}

function chartRendererScript(): string {
  return `(function(){var state=window.__PRESENTON_JSON_CHARTS__={status:"pending"};function finish(status,message){state.status=status;if(message)state.message=message}function formatValue(value){if(!Number.isFinite(value))return "";if(Math.abs(value)%1===0)return String(value);return String(Math.round(value*100)/100)}var dataLabelPlugin={id:"presentonDataLabels",afterDatasetsDraw:function(chart,args,options){if(!options||!options.enabled)return;var ctx=chart.ctx;ctx.save();ctx.fillStyle=options.color||"#374151";ctx.font="600 "+(options.fontSize||11)+"px "+(options.fontFamily||"Arial, Helvetica, sans-serif");ctx.textAlign="center";chart.data.datasets.forEach(function(dataset,datasetIndex){var meta=chart.getDatasetMeta(datasetIndex);if(meta.hidden)return;meta.data.forEach(function(element,index){var raw=Array.isArray(dataset.data)?dataset.data[index]:0;var value=typeof raw==="number"?raw:Number(raw);var label=formatValue(value);if(!label)return;var point=typeof element.tooltipPosition==="function"?element.tooltipPosition():element;var offset=meta.type==="bar"?(value>=0?-6:12):0;ctx.textBaseline=offset<0?"bottom":"top";ctx.fillText(label,point.x,point.y+offset)})});ctx.restore()}};function render(){if(!window.Chart){finish("error","Chart.js failed to load");return}try{var Chart=window.Chart;Chart.register(dataLabelPlugin);document.querySelectorAll("canvas[data-presenton-chart]").forEach(function(canvas){var configText=canvas.getAttribute("data-chart-config");if(!configText)return;var config=JSON.parse(configText);config.options=config.options||{};config.options.animation=false;config.options.responsive=false;config.options.maintainAspectRatio=false;var existing=typeof Chart.getChart==="function"?Chart.getChart(canvas):null;if(existing)existing.destroy();var chart=new Chart(canvas,config);if(typeof chart.update==="function")chart.update("none")});requestAnimationFrame(function(){finish("ready")})}catch(error){finish("error",error&&error.message?error.message:String(error))}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",render,{once:true})}else{render()}})();`;
}

function frameAndBoxStyle(item: JsonRecord, mode: RenderMode, extra = ""): string {
  return `${frameStyle(item, mode)}${boxStyle(item)}${extra}`;
}

function frameStyle(
  item: JsonRecord,
  mode: RenderMode,
  fallbackSize?: { width: number; height: number }
): string {
  const box = readBox(item, fallbackSize);
  let style = `box-sizing:border-box;min-height:0;min-width:0;position:${
    mode === "absolute" ? "absolute" : "relative"
  };`;
  if (mode === "absolute") {
    style += `left:${cssNumber(box.x)}px;top:${cssNumber(box.y)}px;`;
  }
  if (box.width != null) style += `width:${cssNumber(box.width)}px;`;
  if (box.height != null) style += `height:${cssNumber(box.height)}px;`;
  return style;
}

function readBox(
  item: JsonRecord,
  fallbackSize?: { width: number; height: number }
): Box {
  const position = readRecord(item.position);
  const size = readRecord(item.size);
  return {
    x: readNumber(position.x) ?? 0,
    y: readNumber(position.y) ?? 0,
    width: readNumber(size.width) ?? fallbackSize?.width,
    height: readNumber(size.height) ?? fallbackSize?.height,
  };
}

function childrenBounds(
  children: JsonRecord[]
): { width: number; height: number } {
  return children.reduce<{ width: number; height: number }>(
    (bounds, child) => {
      const box = readBox(child);
      return {
        width: Math.max(bounds.width, box.x + (box.width ?? 1)),
        height: Math.max(bounds.height, box.y + (box.height ?? 1)),
      };
    },
    { width: 1, height: 1 }
  );
}

function boxStyle(item: JsonRecord): string {
  const fill = readRecord(item.fill);
  const stroke = readRecord(item.stroke);
  const shadow = readRecord(item.shadow);
  const radius = readRecord(item.borderRadius ?? item.border_radius);
  let style = transformStyle(item);
  const fillColor = readString(fill.color);
  if (fillColor) {
    style += `background-color:${escapeCssColor(
      colorWithOpacity(fillColor, readNumber(fill.opacity))
    )};`;
  }
  const strokeColor = readString(stroke.color);
  const strokeWidth = readNumber(stroke.width);
  if (strokeColor || strokeWidth != null) {
    style += `border:${cssNumber(strokeWidth ?? 1)}px solid ${escapeCssColor(
      colorWithOpacity(strokeColor ?? "transparent", readNumber(stroke.opacity))
    )};`;
  }
  const borderRadius = borderRadiusStyle(radius);
  if (borderRadius) style += `border-radius:${borderRadius};`;
  const shadowOpacity = Object.keys(shadow).length
    ? (readNumber(shadow.opacity) ?? 1)
    : 0;
  if (shadowOpacity > 0) {
    style += `box-shadow:${cssNumber(
      readNumber(shadow.offsetX ?? shadow.offset_x) ?? 0
    )}px ${cssNumber(readNumber(shadow.offsetY ?? shadow.offset_y) ?? 0)}px ${cssNumber(
      readNumber(shadow.blur) ?? 0
    )}px ${escapeCssColor(
      colorWithOpacity(readString(shadow.color) ?? "#000000", shadowOpacity)
    )};`;
  }
  const opacity = readNumber(item.opacity);
  if (opacity != null) style += `opacity:${cssNumber(opacity)};`;
  return style;
}

function transformStyle(item: JsonRecord): string {
  const rotation = readNumber(item.rotation);
  const flipH = readBoolean(item.flip_h ?? item.flipH);
  const flipV = readBoolean(item.flip_v ?? item.flipV);
  if (!rotation && !flipH && !flipV) return "";

  const effectiveRotation = flipH !== flipV ? -(rotation ?? 0) : rotation ?? 0;
  const transforms = [];
  if (effectiveRotation) transforms.push(`rotate(${cssNumber(effectiveRotation)}deg)`);
  if (flipH) transforms.push("scaleX(-1)");
  if (flipV) transforms.push("scaleY(-1)");
  return `transform:${transforms.join(" ")};transform-origin:center;`;
}

function fontStyle(fontValue: unknown): string {
  const font = readRecord(fontValue);
  let style = `color:${escapeCssColor(readString(font.color) ?? "#111827")};`;
  const family = readString(font.family);
  const size = readNumber(font.size);
  if (family) style += `font-family:${escapeCssFont(family)};`;
  if (size != null) style += `font-size:${cssNumber(size)}px;`;
  if (readBoolean(font.italic)) style += "font-style:italic;";
  if (readBoolean(font.bold)) style += "font-weight:700;";
  const lineHeight = readNumber(font.lineHeight ?? font.line_height);
  if (lineHeight != null) style += `line-height:${cssNumber(lineHeight)};`;
  const letterSpacing = readNumber(font.letterSpacing ?? font.letter_spacing);
  if (letterSpacing != null) style += `letter-spacing:${cssNumber(letterSpacing)}px;`;
  return style;
}

function tableCellStyle(cellValue: unknown, header: boolean): string {
  const cell = readRecord(cellValue);
  const textValue = cell.text;
  const text = readRecord(textValue);
  const cellFont = Object.keys(text).length
    ? { ...readRecord(cell.font), ...readRecord(text.font) }
    : readRecord(cell.font);
  const alignment =
    readString(cell.alignment) ??
    readString(readRecord(cell.alignment).horizontal) ??
    readString(readRecord(text.alignment).horizontal);
  const fill = readRecord(cell.color ?? cell.fill);
  const stroke = readRecord(cell.stroke);
  let style = `${fontStyle(cellFont)}border:${cssNumber(
    readNumber(stroke.width) ?? 1
  )}px solid ${escapeCssColor(
    colorWithOpacity(readString(stroke.color) ?? "#D1D5DB", readNumber(stroke.opacity))
  )};overflow:hidden;padding:4px 6px;text-align:${textAlign(
    alignment
  )};vertical-align:middle;white-space:pre-wrap;word-break:break-word;`;
  if (header && !readBoolean(cellFont.bold)) style += "font-weight:700;";
  const fillColor = readString(fill.color);
  if (fillColor) {
    style += `background:${escapeCssColor(
      colorWithOpacity(fillColor, readNumber(fill.opacity))
    )};`;
  }
  return style;
}

function textOverflowStyle(): string {
  return "overflow:visible;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;";
}

function cellText(cellValue: unknown): string {
  if (typeof cellValue === "string" || typeof cellValue === "number") {
    return escapeHtml(readStringValue(cellValue));
  }

  const cell = readRecord(cellValue);
  const directRuns = readArray(cell.runs).map(readRecord);
  if (directRuns.length) {
    const runs = normalizeRunsForHtml(
      directRuns,
      Object.prototype.hasOwnProperty.call(cell, "text")
        ? cell.text
        : joinedRunText(directRuns),
      cell.font,
    );
    return runs
      .map((run) => {
        const runFont = { ...readRecord(cell.font), ...readRecord(run.font) };
        return `<span style="${fontStyle(runFont)}">${escapeHtml(
          readStringValue(run.text)
        )}</span>`;
      })
      .join("");
  }

  const text = cell.text;
  if (typeof text === "string") return escapeHtml(text);
  const textRecord = readRecord(text);
  const textRuns = normalizedRunsForHtml(textRecord, textRecord.font);
  if (textRuns.length) {
    return textRuns
      .map((run) => {
        const runFont = { ...readRecord(textRecord.font), ...readRecord(run.font) };
        return `<span style="${fontStyle(runFont)}">${escapeHtml(
          readStringValue(run.text)
        )}</span>`;
      })
      .join("");
  }
  return escapeHtml(readStringValue(textRecord.text));
}

function readRuns(item: JsonRecord): JsonRecord[] {
  const runs = readArray(item.runs).map(readRecord);
  return runs.length ? runs : [{ text: readStringValue(item.text) }];
}

function normalizedRunsForHtml(item: JsonRecord, fallbackFont: unknown): JsonRecord[] {
  const runs = readRuns(item);
  return normalizeRunsForHtml(
    runs,
    Object.prototype.hasOwnProperty.call(item, "text")
      ? item.text
      : joinedRunText(runs),
    item.font ?? fallbackFont,
  );
}

function normalizedListRunsForHtml(value: unknown, fallbackFont: unknown): JsonRecord[] {
  const runs = readListRuns(value);
  const record = readRecord(value);
  return normalizeRunsForHtml(
    runs,
    Object.prototype.hasOwnProperty.call(record, "text")
      ? record.text
      : joinedRunText(runs),
    record.font ?? fallbackFont,
  );
}

function normalizeRunsForHtml(
  runs: JsonRecord[],
  text: unknown,
  fallbackFont: unknown,
): JsonRecord[] {
  const normalized = normalizeRawTextMarkdownElement({
    type: "text",
    font: fallbackFont,
    text: readStringValue(text),
    runs,
  }).runs;

  return normalized.map((run) => ({
    text: run.text,
    font: run.font,
  }));
}

function joinedRunText(runs: JsonRecord[]): string {
  return runs.map((run) => readStringValue(run.text)).join("");
}

function readListRuns(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(readRecord);
  const record = readRecord(value);
  const runs = readArray(record.runs).map(readRecord);
  if (runs.length) return runs;
  if (Object.prototype.hasOwnProperty.call(record, "text")) {
    return [{ text: readStringValue(record.text), font: record.font }];
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [{ text: readStringValue(value) }];
  }
  return [];
}

function isComponent(item: JsonRecord): item is JsonRecord & { elements: unknown[] } {
  const type = readString(item.type);
  return Array.isArray(item.elements) && (!type || !ELEMENT_TYPES.has(type));
}

function readRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readRecordOrNull(value: unknown): JsonRecord | null {
  const record = readRecord(value);
  return Object.keys(record).length ? record : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringValueOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

function readFontWeight(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  const text = readString(value);
  if (!text) return undefined;
  const normalized = text.toLowerCase().replace(/\s+/g, "");
  const namedWeights: Record<string, string> = {
    thin: "100",
    extralight: "200",
    ultralight: "200",
    light: "300",
    regular: "400",
    normal: "400",
    medium: "500",
    semibold: "600",
    demibold: "600",
    bold: "700",
    extrabold: "800",
    ultrabold: "800",
    black: "900",
    heavy: "900",
  };
  if (namedWeights[normalized]) return namedWeights[normalized];
  return /^\d{3}$/.test(normalized) ? normalized : undefined;
}

function inferFontWeight(value: string): string | undefined {
  const normalized = decodeFontHint(value).toLowerCase();
  if (/\b(black|heavy)\b/.test(normalized)) return "900";
  if (/\b(extra|ultra)[\s_-]?bold\b/.test(normalized)) return "800";
  if (/\bbold\b/.test(normalized)) return "700";
  if (/\b(semi|demi)[\s_-]?bold\b/.test(normalized)) return "600";
  if (/\bmedium\b/.test(normalized)) return "500";
  if (/\bregular\b|\bnormal\b/.test(normalized)) return "400";
  if (/\blight\b/.test(normalized)) return "300";
  if (/\b(extra|ultra)[\s_-]?light\b/.test(normalized)) return "200";
  if (/\bthin\b/.test(normalized)) return "100";
  return undefined;
}

function readFontStyle(value: unknown): string | undefined {
  const text = readString(value)?.toLowerCase();
  return text === "italic" || text === "oblique" || text === "normal"
    ? text
    : undefined;
}

function inferFontStyle(value: string): string | undefined {
  return /\bitalic\b/i.test(decodeFontHint(value)) ? "italic" : undefined;
}

function decodeFontHint(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function paddingStyle(padding: JsonRecord): string {
  return `padding:${cssNumber(readNumber(padding.top) ?? 0)}px ${cssNumber(
    readNumber(padding.right) ?? 0
  )}px ${cssNumber(readNumber(padding.bottom) ?? 0)}px ${cssNumber(
    readNumber(padding.left) ?? 0
  )}px;`;
}

function borderRadiusStyle(radius: JsonRecord): string {
  const tl = readNumber(radius.tl) ?? 0;
  const tr = readNumber(radius.tr) ?? tl;
  const br = readNumber(radius.br) ?? tl;
  const bl = readNumber(radius.bl) ?? tl;
  return tl || tr || br || bl
    ? `${cssNumber(tl)}px ${cssNumber(tr)}px ${cssNumber(br)}px ${cssNumber(bl)}px`
    : "";
}

function imageFit(value: unknown): string {
  return value === "cover" || value === "fill" ? value : "contain";
}

function imageMaskSize(value: unknown): string {
  const fit = imageFit(value);
  return fit === "fill" ? "100% 100%" : fit;
}

function imageClipPathStyle(item: JsonRecord): string {
  const raw = readString(item.clippath ?? item.clipPath ?? item.clip_path);
  const clipPath = raw?.trim();
  if (!clipPath || !isSafeImageClipPath(clipPath)) return "";
  return `clip-path:${clipPath};-webkit-clip-path:${clipPath};`;
}

function isSafeImageClipPath(value: string) {
  return /^(polygon|inset|circle|ellipse)\([0-9a-zA-Z\s.,%+\-]*\)$/i.test(value);
}

function imageFocusStyle(item: JsonRecord): string {
  const focus = readArray(item.focus);
  const rawX = item.focus_x ?? item.focusX ?? focus[0];
  const rawY = item.focus_y ?? item.focusY ?? focus[1];
  if (rawX == null && rawY == null) return "";

  const focusX = clamp(readNumber(rawX) ?? 50, 0, 100);
  const focusY = clamp(readNumber(rawY) ?? 50, 0, 100);
  return `object-position:${cssNumber(focusX)}% ${cssNumber(focusY)}%;`;
}

function horizontalAlign(value: string | null): string {
  return value === "center" ? "center" : value === "right" ? "flex-end" : "flex-start";
}

function verticalAlign(value: string | null): string {
  return value === "middle" || value === "center"
    ? "center"
    : value === "bottom"
      ? "flex-end"
      : "flex-start";
}

function textAlign(value: string | null): string {
  return value === "center" || value === "right" ? value : "left";
}

function cssAlignment(value: string | null, fallback: string): string {
  return value === "flex-start" ||
    value === "flex-end" ||
    value === "center" ||
    value === "stretch"
    ? value
    : fallback;
}

function normalizeCssColor(color: string): string {
  const normalized = color.trim();
  const hex = normalized.match(/^#?([0-9a-fA-F]{6})$/)?.[1];
  return hex ? `#${hex}` : normalized;
}

function colorWithOpacity(color: string, opacity: number | null): string {
  const normalized = normalizeCssColor(color);
  if (opacity == null || opacity >= 1 || normalized === "transparent") return normalized;
  const hex = normalized.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return normalized;
  const value = Number.parseInt(hex, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${Math.max(
    0,
    opacity
  )})`;
}

function cssNumber(value: number): string {
  return Number.isFinite(value) ? String(value) : "0";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function escapeScriptText(value: string): string {
  return value.replaceAll("</script", "<\\/script").replaceAll("<!--", "<\\!--");
}

function escapeStyleText(value: string): string {
  return value.replaceAll("</style", "<\\/style");
}

function escapeCssColor(value: string): string {
  return /^[#(),.%\s\w-]+$/.test(value) ? value : "transparent";
}

function escapeCssFont(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function cssUrl(value: string): string {
  return `url('${escapeCssUrl(value)}')`;
}

function escapeCssUrl(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("'", "\\'")
    .replaceAll("\n", "")
    .replaceAll("\r", "");
}

function isFontStylesheetUrl(url: string): boolean {
  return /\.css(\?|$)/i.test(url) || /fonts\.googleapis\.com/.test(url);
}
