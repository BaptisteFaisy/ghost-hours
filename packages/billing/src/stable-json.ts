/**
 * Stable JSON (HEU-F-27: "données en JSON").
 *
 * `JSON.stringify` follows insertion order, which means two runs of the same
 * dataset can produce two different files. Sorting keys recursively gives a
 * byte-identical export for identical input, so a JSON export can be diffed,
 * hashed and re-imported without noise. Array order is preserved: the order of
 * lines is meaningful, the order of a key is not.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeys(source[key]);
    return out;
  }
  return value;
}

export function stableStringify(value: unknown, indent = 2): string {
  return `${JSON.stringify(sortKeys(value), null, indent)}\n`;
}
