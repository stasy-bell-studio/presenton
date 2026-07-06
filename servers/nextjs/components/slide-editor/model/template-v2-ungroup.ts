type RawRecord = Record<string, any>;

export type TemplateV2UngroupBox = {
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
  box: TemplateV2UngroupBox | null;
};

type UngroupDeps = {
  childArrayInfo: (element: RawRecord) => ChildArrayInfo | null;
  componentBox: (component: RawRecord) => TemplateV2UngroupBox;
  elementBox: (element: RawRecord) => TemplateV2UngroupBox;
  isBoxVisualType: (type: string | null) => boolean;
  layoutChildren: (
    parent: RawRecord,
    children: unknown[],
    parentBox: TemplateV2UngroupBox,
  ) => LaidOutChild[];
};

export type TemplateV2UngroupSelection = {
  kind: "component";
  componentIndex: number;
};

export function canUngroupTemplateV2Component(
  component: RawRecord | null | undefined,
) {
  if (!component) return false;
  const elements = readArray(component.elements).filter(isRecord);
  if (elements.length > 1) return true;
  return elements.some(hasUngroupableFlowLayout);
}

export function ungroupTemplateV2ComponentInUi(
  sourceUi: RawRecord,
  componentIndex: number,
  deps: UngroupDeps,
): { ui: RawRecord; selection: TemplateV2UngroupSelection } | null {
  const components = [...readArray(sourceUi.components)];
  const component = asRecord(components[componentIndex]);
  if (!component || !canUngroupTemplateV2Component(component)) return null;

  const ungroupedComponents = ungroupedComponentsFromComponent(
    component,
    componentIndex,
    deps,
  );
  if (ungroupedComponents.length === 0) return null;

  components.splice(componentIndex, 1, ...ungroupedComponents);
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

function ungroupedComponentsFromComponent(
  component: RawRecord,
  componentIndex: number,
  deps: UngroupDeps,
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
      return ungroupElementTree(
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
    .map((entry, index) => ungroupedComponent(entry, idBase, index));
}

function ungroupElementTree(
  element: RawRecord,
  box: TemplateV2UngroupBox,
  deps: UngroupDeps,
): Array<{ element: RawRecord; box: TemplateV2UngroupBox }> {
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
      return ungroupElementTree(
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

function hasUngroupableFlowLayout(element: RawRecord): boolean {
  const childInfo = childArrayInfoFromRecord(element);
  if (!childInfo) return false;
  const children = childInfo.items.filter(isRecord);
  if (isFlowLayoutType(readString(element.type)) && children.length > 0) {
    return true;
  }
  return children.some(hasUngroupableFlowLayout);
}

function ungroupedComponent(
  entry: { element: RawRecord; box: TemplateV2UngroupBox },
  idBase: string,
  index: number,
): RawRecord {
  const { box, element } = entry;
  return {
    id: `${idBase}_part_${index + 1}`,
    description: "Ungrouped component element",
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

function childArrayInfoFromRecord(element: RawRecord): ChildArrayInfo | null {
  if (Array.isArray(element.children)) return { items: element.children };
  if (Array.isArray(element.elements)) return { items: element.elements };
  if (asRecord(element.child)) return { items: [element.child] };
  return null;
}

function isFlowLayoutType(type: string | null) {
  return (
    type === "flex" ||
    type === "grid" ||
    type === "list-view" ||
    type === "grid-view"
  );
}

function elementHasVisibleBoxStyle(
  element: RawRecord,
  deps: UngroupDeps,
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
