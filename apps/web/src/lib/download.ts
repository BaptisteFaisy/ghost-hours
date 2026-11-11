/**
 * Download and print helpers (HEU-F-27).
 *
 * Nothing is sent anywhere: the browser builds the file in memory and the
 * user saves it. In jsdom neither `URL.createObjectURL` nor a real window
 * exists, so both helpers answer `false` instead of throwing — the DOM tests
 * rely on that.
 */

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
}

export function openPrintWindow(html: string): boolean {
  if (typeof window === 'undefined' || typeof window.open !== 'function') return false;
  const tab = window.open('', '_blank');
  if (!tab) return false;
  tab.opener = null;
  tab.document.write(html);
  tab.document.close();
  if (typeof tab.focus === 'function') tab.focus();
  if (typeof tab.print === 'function') tab.print();
  return true;
}
