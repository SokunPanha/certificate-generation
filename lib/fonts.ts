export interface FontOption {
  label: string;
  value: string;
  google: boolean;
}

export const FONTS: FontOption[] = [
  // System
  { label: "Arial", value: "Arial", google: false },
  { label: "Georgia", value: "Georgia", google: false },
  { label: "Times New Roman", value: "Times New Roman", google: false },
  { label: "Courier New", value: "Courier New", google: false },
  // Google – Latin
  { label: "Roboto", value: "Roboto", google: true },
  { label: "Open Sans", value: "Open Sans", google: true },
  { label: "Lato", value: "Lato", google: true },
  { label: "Montserrat", value: "Montserrat", google: true },
  { label: "Poppins", value: "Poppins", google: true },
  { label: "Raleway", value: "Raleway", google: true },
  { label: "Playfair Display", value: "Playfair Display", google: true },
  { label: "Merriweather", value: "Merriweather", google: true },
  { label: "Cinzel", value: "Cinzel", google: true },
  { label: "EB Garamond", value: "EB Garamond", google: true },
  // Google – Khmer
  { label: "Noto Serif Khmer", value: "Noto Serif Khmer", google: true },
  { label: "Noto Sans Khmer", value: "Noto Sans Khmer", google: true },
  { label: "Hanuman", value: "Hanuman", google: true },
  { label: "Moul", value: "Moul", google: true },
  { label: "Battambang", value: "Battambang", google: true },
  { label: "Dangrek", value: "Dangrek", google: true },
  { label: "Bayon", value: "Bayon", google: true },
  { label: "Siemreap", value: "Siemreap", google: true },
];

const loaded = new Set<string>();

export async function loadFont(family: string): Promise<void> {
  const font = FONTS.find((f) => f.value === family);
  if (!font?.google || loaded.has(family)) return;

  const param = encodeURIComponent(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${param}:wght@400;700&display=swap`;
  document.head.appendChild(link);

  await document.fonts.ready;
  loaded.add(family);
}
