import type { Canvas } from "fabric";

export async function exportToImage(canvas: Canvas, format: "png" | "jpeg"): Promise<void> {
  canvas.discardActiveObject();
  canvas.renderAll();

  const dataURL = canvas.toDataURL({
    format,
    multiplier: 2,
    quality: format === "jpeg" ? 0.92 : 1,
  });

  const ext = format === "jpeg" ? "jpg" : "png";
  const a = Object.assign(document.createElement("a"), {
    href: dataURL,
    download: `certificate.${ext}`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
