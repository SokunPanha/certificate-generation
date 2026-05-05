import type { Canvas } from "fabric";

export async function exportToPDF(canvas: Canvas): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  canvas.discardActiveObject();
  canvas.renderAll();

  const w = canvas.getWidth();
  const h = canvas.getHeight();

  const dataURL = canvas.toDataURL({
    format: "png",
    multiplier: 3,
  });

  const pdf = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
  });

  pdf.addImage(dataURL, "PNG", 0, 0, w, h);
  pdf.save("certificate.pdf");
}
