/**
 * Vite's `?raw` import suffix: the file content as a string.
 * Used by the sample-month fixture (`.ics`, Markdown notes).
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
