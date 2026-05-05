export interface BulkProgress {
  current: number;
  total: number;
  label: string;
}

function fillPlaceholders(jsonStr: string, row: Record<string, string>): string {
  let result = jsonStr;
  for (const [key, value] of Object.entries(row)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function bulkExportZip(
  templateJSON: object,
  rows: Record<string, string>[],
  canvasWidth: number,
  canvasHeight: number,
  onProgress: (p: BulkProgress) => void
): Promise<void> {
  const [{ default: JSZip }, fabric, { default: jsPDF }] = await Promise.all([
    import("jszip"),
    import("fabric"),
    import("jspdf"),
  ]);

  const zip = new JSZip();
  const templateStr = JSON.stringify(templateJSON);
  const isLandscape = canvasWidth > canvasHeight;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstValue = row[Object.keys(row)[0]] ?? String(i + 1);

    onProgress({ current: i + 1, total: rows.length, label: firstValue });

    const filledJSON = JSON.parse(fillPlaceholders(templateStr, row));

    // Off-screen hidden canvas for rendering
    const el = document.createElement("canvas");
    el.style.cssText = "position:absolute;left:-9999px;top:-9999px;";
    document.body.appendChild(el);

    const fc = new fabric.Canvas(el, {
      width: canvasWidth,
      height: canvasHeight,
      renderOnAddRemove: false,
    });

    await fc.loadFromJSON(filledJSON);
    fc.renderAll();

    const dataURL = fc.toDataURL({ format: "png", multiplier: 2 });
    fc.dispose();
    document.body.removeChild(el);

    const pdf = new jsPDF({
      orientation: isLandscape ? "landscape" : "portrait",
      unit: "px",
      format: [canvasWidth, canvasHeight],
    });
    pdf.addImage(dataURL, "PNG", 0, 0, canvasWidth, canvasHeight);

    const safe = firstValue.replace(/[^\wក-៿\s-]/g, "").trim();
    zip.file(`${i + 1}_${safe}.pdf`, pdf.output("arraybuffer"));

    // Yield to allow React to repaint the progress bar
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress({ current: rows.length, total: rows.length, label: "Creating ZIP…" });

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: "certificates.zip",
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
