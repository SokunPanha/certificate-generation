import type { Canvas } from "fabric";

export async function exportToPDF(canvas: Canvas): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  canvas.discardActiveObject();
  canvas.renderAll();

  const w = canvas.getWidth();
  const h = canvas.getHeight();
  const dataURL = canvas.toDataURL({ format: "png", multiplier: 3 });

  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
  });

  pdf.addImage(dataURL, "PNG", 0, 0, w, h);
  pdf.save("certificate.pdf");
}

export async function exportPagesToPDF(
  pages: Array<{ canvasJSON: string; bgColor: string }>,
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  const [{ default: jsPDF }, fabric] = await Promise.all([
    import("jspdf"),
    import("fabric"),
  ]);

  const orientation = canvasWidth > canvasHeight ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvasWidth, canvasHeight] });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];

    const tempEl = document.createElement("canvas");
    tempEl.style.cssText = "position:fixed;left:-99999px;top:-99999px;visibility:hidden;";
    document.body.appendChild(tempEl);

    const tempCanvas = new fabric.Canvas(tempEl, {
      width: canvasWidth,
      height: canvasHeight,
      renderOnAddRemove: false,
    });

    await tempCanvas.loadFromJSON(JSON.parse(page.canvasJSON));
    tempCanvas.backgroundColor = page.bgColor;
    tempCanvas.renderAll();

    const dataURL = tempCanvas.toDataURL({ format: "png", multiplier: 3 });
    tempCanvas.dispose();
    document.body.removeChild(tempEl);

    if (i > 0) pdf.addPage([canvasWidth, canvasHeight], orientation);
    pdf.addImage(dataURL, "PNG", 0, 0, canvasWidth, canvasHeight);
  }

  pdf.save("certificate.pdf");
}
