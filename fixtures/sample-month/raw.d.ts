/** Vite and Vitest both resolve `?raw` imports to the file content. */
declare module '*?raw' {
  const content: string;
  export default content;
}
