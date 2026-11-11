/** Property lookups over a parsed component. */

import type { ContentLine } from './content-line.ts';
import type { RawComponent } from './components.ts';

export function allProperties(component: RawComponent, name: string): ContentLine[] {
  return component.properties.filter((property) => property.name === name);
}

export function firstProperty(component: RawComponent, name: string): ContentLine | undefined {
  return component.properties.find((property) => property.name === name);
}

export function firstValue(component: RawComponent, name: string): string | undefined {
  return firstProperty(component, name)?.value;
}

export function firstParam(line: ContentLine, name: string): string | undefined {
  return (line.params[name] ?? [])[0];
}

/** Name → raw value of every property; repeated properties are joined by a comma. */
export function buildRaw(component: RawComponent): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const property of component.properties) {
    const previous = raw[property.name];
    raw[property.name] = previous === undefined ? property.value : `${previous},${property.value}`;
  }
  return raw;
}
