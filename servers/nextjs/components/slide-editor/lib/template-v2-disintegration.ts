type RawRecord = Record<string, any>;

export type TemplateV2DisintegrationBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ChildArrayInfo = {
  items: unknown[];
};

type LaidOutChild = {
  child: RawRecord;
  box: TemplateV2DisintegrationBox | null;
};

type DisintegrationDeps = {
  childArrayInfo: (element: RawRecord) => ChildArrayInfo | null;
  componentBox: (component: RawRecord) => TemplateV2DisintegrationBox;
  elementBox: (element: RawRecord) => TemplateV2DisintegrationBox;
  isBoxVisualType: (type: string | null) => boolean;
  layoutChildren: (
    parent: RawRecord,
    children: unknown[],
    parentBox: TemplateV2DisintegrationBox,
  ) => LaidOutChild[];
};

export type TemplateV2DisintegrationSelection = {
  kind: "component";
  componentIndex: number;
};

export function disintegrateTemplateV2ComponentInUi(
  sourceUi: RawRecord,
  componentIndex: number,
  deps: DisintegrationDeps,
): { ui: RawRecord; selection: TemplateV2DisintegrationSelection } | null {
  const components = [...readArray(sourceUi.components)];
  const component = asRecord(components[componentIndex]);
  if (!component) return null;

  const disintegratedComponents = disintegratedComponentsFromComponent(
    component,
    componentIndex,
    deps,
  );
  if (disintegratedComponents.length === 0) return null;

  components.splice(componentIndex, 1, ...disintegratedComponents);
  return {
    ui: {
      ...sourceUi,
      components,
    },
    selection: {
      kind: "component",
      componentIndex,
    },
  };
}

function disintegratedComponentsFromComponent(
  component: RawRecord,
  componentIndex: number,
  deps: DisintegrationDeps,
): RawRecord[] {
  const componentBoxValue = deps.componentBox(component);
  const idBase = normalizeId(
    readString(component.id) ??
      readString(component.name) ??
      readString(component.description) ??
      `component_${componentIndex + 1}`,
  );
  return readArray(component.elements)
    .filter(isRecord)
    .flatMap((element) => {
      const box = deps.elementBox(element);
      return disintegrateElementTree(
        element,
        {
          x: componentBoxValue.x + box.x,
          y: componentBoxValue.y + box.y,
          width: box.width,
          height: box.height,
        },
        deps,
      );
    })
    .map((entry, index) => disintegratedComponent(entry, idBase, index));
}

function disintegrateElementTree(
  element: RawRecord,
  box: TemplateV2DisintegrationBox,
  deps: DisintegrationDeps,
): Array<{ element: RawRecord; box: TemplateV2DisintegrationBox }> {
  const childInfo = deps.childArrayInfo(element);
  if (!childInfo) return [{ element, box }];

  const currentLevel = elementHasVisibleBoxStyle(element, deps)
    ? [{ element: stripElementChildren(element), box }]
    : [];
  const children = deps
    .layoutChildren(
      element,
      childInfo.items,
      { x: 0, y: 0, width: box.width, height: box.height },
    )
    .flatMap((item) => {
      const childBox = item.box ?? deps.elementBox(item.child);
      return disintegrateElementTree(
        item.child,
        {
          x: box.x + childBox.x,
          y: box.y + childBox.y,
          width: childBox.width,
          height: childBox.height,
        },
        deps,
      );
    });

  return [...currentLevel, ...children];
}

function disintegratedComponent(
  entry: { element: RawRecord; box: TemplateV2DisintegrationBox },
  idBase: string,
  index: number,
): RawRecord {
  const { box, element } = entry;
  return {
    id: `${idBase}_part_${index + 1}`,
    description: "Disintegrated component element",
    position: { x: box.x, y: box.y },
    size: { width: box.width, height: box.height },
    elements: [
      {
        ...cloneJson(element),
        position: { x: 0, y: 0 },
        size: { width: box.width, height: box.height },
        __presenton_manual_position: true,
      },
    ],
  };
}

function stripElementChildren(element: RawRecord): RawRecord {
  const rest = { ...element };
  delete rest.child;
  delete rest.children;
  delete rest.elements;
  delete rest.item;
  return rest;
}

function elementHasVisibleBoxStyle(
  element: RawRecord,
  deps: DisintegrationDeps,
) {
  const type = readString(element.type);
  if (!deps.isBoxVisualType(type)) return false;
  const fill = asRecord(element.fill);
  const stroke = asRecord(element.stroke);
  const shadow = asRecord(element.shadow);
  return Boolean(
    readString(fill?.color) ||
      readNumber(fill?.opacity) != null ||
      readString(stroke?.color) ||
      (readNumber(stroke?.width) ?? 0) > 0 ||
      readString(shadow?.color) ||
      (readNumber(shadow?.opacity) ?? 0) > 0 ||
      element.border_radius != null ||
      element.borderRadius != null ||
      readString(element.color),
  );
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(asRecord(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "component";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
