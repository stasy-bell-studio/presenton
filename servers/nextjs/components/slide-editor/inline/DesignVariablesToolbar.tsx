import type { SlideElement } from "../lib/slide-schema";
import {
  applyDesignVariableOption,
  designVariableNameLabel,
  designVariableOptionLabel,
  selectedDesignVariableOptionIndex,
} from "../lib/design-variables";
import { inlineStyles } from "./inlineStyles";

export function DesignVariablesToolbar({
  element,
  index,
  scale,
  onChange,
}: {
  element: SlideElement;
  index: number;
  scale: number;
  onChange: (index: number, element: SlideElement) => void;
}) {
  const variables = element.design_variables ?? [];
  if (variables.length === 0) return null;

  return (
    <div style={{ ...inlineStyles.toolbar, left: Math.max(8, (element.position?.x ?? 0) * scale), top: Math.max(8, (element.position?.y ?? 0) * scale - 48) }} onMouseDown={(event) => event.stopPropagation()}>
      {variables.map((variable) => {
        const selectedIndex = selectedDesignVariableOptionIndex(element, variable);
        const label = designVariableNameLabel(variable.name);
        return (
          <select
            key={variable.name}
            aria-label={label}
            title={label}
            value={selectedIndex >= 0 ? String(selectedIndex) : ""}
            onChange={(event) => {
              const optionIndex = Number(event.target.value);
              const option = variable.options[optionIndex];
              onChange(
                index,
                applyDesignVariableOption(element, variable, option),
              );
            }}
            style={{ ...inlineStyles.select, minWidth: 118 }}
          >
            <option value="" disabled>
              {label}
            </option>
            {variable.options.map((option, optionIndex) => (
              <option key={optionIndex} value={optionIndex}>
                {designVariableOptionLabel(option)}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
