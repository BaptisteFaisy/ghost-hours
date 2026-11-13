// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { fr } from './fr.ts';

/**
 * Every key the dictionaries declare must be rendered somewhere.
 *
 * A key no screen can say is a feature that was built and never shipped: that
 * is exactly what the audit of 12 November found — 43 written labels, from the
 * month navigation to the confidence grade, that no interface ever displayed.
 * The gap was closed; this test keeps it closed.
 *
 * Keys built at runtime (`t(\`status.${block.status}\`)`) cannot be found as
 * literals, so the prefixes the source actually builds are collected from the
 * source itself: the test reads the code, it does not carry a list to maintain.
 */

/** `apps/web/src`, the folder every screen, component and state module lives in. */
const SRC = fileURLToPath(new URL('..', import.meta.url));

/** Every `.ts` / `.tsx` of the app, the dictionaries themselves excluded. */
function sourceFiles(dir: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // The i18n folder declares the keys; reading it would cover them all.
    if (entry.isDirectory()) {
      if (entry.name !== 'i18n') found.push(...sourceFiles(`${dir}/${entry.name}`));
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(`${dir}/${entry.name}`);
  }
  return found;
}

const blob = sourceFiles().map((path) => readFileSync(path, 'utf8')).join('\n');

/** Prefixes the code builds at runtime: `t(`evidence.${key}`)` → `evidence.`. */
const dynamicPrefixes = [...blob.matchAll(/`([A-Za-z0-9_.]+)\.\$\{/g)].map(
  (match) => `${match[1]}.`,
);

function isRendered(key: string): boolean {
  if (blob.includes(`'${key}'`) || blob.includes(`"${key}"`) || blob.includes(`\`${key}\``)) {
    return true;
  }
  return dynamicPrefixes.some((prefix) => key.startsWith(prefix));
}

describe('the dictionaries carry no invisible label', () => {
  it('renders every English key somewhere in the app', () => {
    const orphans = Object.keys(en).filter((key) => !isRendered(key));
    expect(
      orphans,
      `these keys are declared but no screen can say them — render them or delete them:\n${orphans.join('\n')}`,
    ).toEqual([]);
  });

  it('renders every French key somewhere in the app', () => {
    const orphans = Object.keys(fr).filter((key) => !isRendered(key));
    expect(orphans).toEqual([]);
  });

  it('detects the prefixes the app builds at runtime', () => {
    // Guards the guard: the three dynamic patterns the app really uses must be
    // picked up from the source. If one stops being detected, the keys it
    // builds would be reported as orphans — a false alarm is a disabled test.
    expect(dynamicPrefixes).toContain('status.');
    expect(dynamicPrefixes).toContain('evidence.');
    expect(dynamicPrefixes).toContain('reason.boundedBy.');
  });
});
