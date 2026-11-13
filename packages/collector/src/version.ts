import manifest from '../package.json';

/** Reported by `--version` and stamped into the evidence file; the manifest is the source. */
export const VERSION: string = manifest.version;
