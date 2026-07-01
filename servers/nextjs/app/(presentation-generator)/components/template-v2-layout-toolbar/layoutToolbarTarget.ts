import {
  isTemplateV2LayoutElement,
  type TemplateV2LayoutElement,
} from "./TemplateV2LayoutToolbar";

type RawRecord = Record<string, unknown>;

export type ComponentLayoutElementTarget = {
  element: TemplateV2LayoutElement;
  elementPath: number[];
};

function asRecord(value: unknown): RawRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRecord)
    : null;
}

function childElements(element: RawRecord): unknown[] {
  if (Array.isArray(element.children)) return element.children;
  if (Array.isArray(element.elements)) return element.elements;
  if (asRecord(element.child)) return [element.child];
  if (asRecord(element.item)) return [element.item];
  return [];
}

export function findFirstComponentLayoutElement(
  elements: unknown[],
  parentPath: number[] = [],
): ComponentLayoutElementTarget | null {
  for (let index = 0; index < elements.length; index += 1) {
    const element = asRecord(elements[index]);
    if (!element) continue;
    const elementPath = [...parentPath, index];
    if (isTemplateV2LayoutElement(element)) {
      return { element, elementPath };
    }
    const nested = findFirstComponentLayoutElement(
      childElements(element),
      elementPath,
    );
    if (nested) return nested;
  }
  return null;
}
