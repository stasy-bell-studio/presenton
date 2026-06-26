import type { SlideElement } from "../lib/slide-schema";
import {
  applyDesignVariableOption,
  designVariableNameLabel,
  designVariableOptionLabel,
  selectedDesignVariableOptionIndex,
} from "../lib/design-variables";
import { InlineToolbar } from "./InlineToolbar";
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
    <InlineToolbar element={element} scale={scale}>
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
    </InlineToolbar>
  );
}
