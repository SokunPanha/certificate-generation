export interface BulkProgress {
  current: number;
  total: number;
  label: string;
}

export type ExportMode = "combined" | "zip";

function fillPlaceholders(jsonStr: string, row: Record<string, string>): string {
  let result = jsonStr;
  for (const [key, value] of Object.entries(row)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export async function renderRow(
  fabric: typeof import("fabric"),
  templateStr: string,
  row: Record<string, string>,
  canvasWidth: number,
  canvasHeight: number
): Promise<string> {
  const filledJSON = JSON.parse(fillPlaceholders(templateStr, row));

  // Regenerate QR code images for objects that have a qrText pattern
  for (const obj of (filledJSON.objects ?? []) as Record<string, unknown>[]) {
    const data = obj.data as { role?: string; qrText?: string } | undefined;
    if (data?.role === "qr" && data?.qrText) {
      try {
        const QRCode = (await import("qrcode")).default;
        obj.src = await QRCode.toDataURL(data.qrText, { width: 200, margin: 1 });
      } catch {
        // keep original src on failure
      }
    }
  }
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
  return dataURL;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function bulkExport(
  mode: ExportMode,
  templateJSON: object,
  rows: Record<string, string>[],
  canvasWidth: number,
  canvasHeight: number,
  onProgress: (p: BulkProgress) => void
): Promise<void> {
  const isLandscape = canvasWidth > canvasHeight;
  const orientation = isLandscape ? "landscape" : "portrait";
  const templateStr = JSON.stringify(templateJSON);

  const [fabricModule, { default: jsPDF }, JSZipModule] = await Promise.all([
    import("fabric"),
    import("jspdf"),
    mode === "zip" ? import("jszip") : Promise.resolve(null),
  ]);

  const fabric = fabricModule;

  if (mode === "combined") {
    const pdf = new jsPDF({ orientation, unit: "px", format: [canvasWidth, canvasHeight] });

    for (let i = 0; i < rows.length; i++) {
      const label = rows[i][Object.keys(rows[i])[0]] ?? String(i + 1);
      onProgress({ current: i + 1, total: rows.length, label });

      const dataURL = await renderRow(fabric, templateStr, rows[i], canvasWidth, canvasHeight);

      if (i > 0) pdf.addPage([canvasWidth, canvasHeight], orientation);
      pdf.addImage(dataURL, "PNG", 0, 0, canvasWidth, canvasHeight);

      await new Promise((r) => setTimeout(r, 0));
    }

    onProgress({ current: rows.length, total: rows.length, label: "Saving PDF…" });
    triggerDownload(pdf.output("blob"), "certificates.pdf");

  } else {
    const { default: JSZip } = JSZipModule!;
    const zip = new JSZip();

    for (let i = 0; i < rows.length; i++) {
      const firstValue = rows[i][Object.keys(rows[i])[0]] ?? String(i + 1);
      onProgress({ current: i + 1, total: rows.length, label: firstValue });

      const dataURL = await renderRow(fabric, templateStr, rows[i], canvasWidth, canvasHeight);

      const pdf = new jsPDF({ orientation, unit: "px", format: [canvasWidth, canvasHeight] });
      pdf.addImage(dataURL, "PNG", 0, 0, canvasWidth, canvasHeight);

      const safe = firstValue.replace(/[^\wក-៿\s-]/g, "").trim();
      zip.file(`${i + 1}_${safe}.pdf`, pdf.output("arraybuffer"));

      await new Promise((r) => setTimeout(r, 0));
    }

    onProgress({ current: rows.length, total: rows.length, label: "Creating ZIP…" });
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, "certificates.zip");
  }
}
