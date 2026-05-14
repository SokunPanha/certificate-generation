export function openPrintWindow(
  dataURLs: string[],
  canvasSize: { width: number; height: number }
): void {
  if (!dataURLs.length) return;

  const isLandscape = canvasSize.width > canvasSize.height;
  const orientation = isLandscape ? "landscape" : "portrait";

  const pages = dataURLs
    .map((url) => `<div class="page"><img src="${url}"></div>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #fff; }
  .page {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  @page { margin: 0; size: ${orientation}; }
</style>
</head>
<body>${pages}</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) {
    alert("Pop-ups are blocked. Please allow pop-ups for this site to use Print.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.addEventListener("load", () => {
    win.focus();
    win.print();
    win.addEventListener("afterprint", () => win.close());
  });
}
