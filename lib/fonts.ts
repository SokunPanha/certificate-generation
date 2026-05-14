import { LOCAL_FONT_ENTRIES } from "./local-fonts";

export interface FontOption {
  label: string;
  value: string;
  google: boolean;
  local?: boolean;
  file?: string;
}

const SYSTEM_FONTS: FontOption[] = [
  { label: "Arial", value: "Arial", google: false },
  { label: "Georgia", value: "Georgia", google: false },
  { label: "Times New Roman", value: "Times New Roman", google: false },
  { label: "Courier New", value: "Courier New", google: false },
];

const GOOGLE_FONTS: FontOption[] = [
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
  { label: "Noto Serif Khmer", value: "Noto Serif Khmer", google: true },
  { label: "Noto Sans Khmer", value: "Noto Sans Khmer", google: true },
  { label: "Hanuman", value: "Hanuman", google: true },
  { label: "Moul", value: "Moul", google: true },
  { label: "Battambang", value: "Battambang", google: true },
  { label: "Dangrek", value: "Dangrek", google: true },
  { label: "Bayon", value: "Bayon", google: true },
  { label: "Siemreap", value: "Siemreap", google: true },
];

const existingValues = new Set([
  ...SYSTEM_FONTS.map((f) => f.value),
  ...GOOGLE_FONTS.map((f) => f.value),
]);

const localSeen = new Set<string>();
const LOCAL_FONTS: FontOption[] = LOCAL_FONT_ENTRIES.filter((e) => {
  if (existingValues.has(e.label) || localSeen.has(e.label)) return false;
  localSeen.add(e.label);
  return true;
}).map((e) => ({
  label: e.label,
  value: e.label,
  google: false,
  local: true,
  file: e.file,
}));

export const FONTS: FontOption[] = [
  ...SYSTEM_FONTS,
  ...GOOGLE_FONTS,
  ...LOCAL_FONTS,
];

export const FONT_GROUPS: { label: string; fonts: FontOption[] }[] = [
  { label: "System", fonts: SYSTEM_FONTS },
  { label: "Google Fonts", fonts: GOOGLE_FONTS },
  { label: "Local Fonts", fonts: LOCAL_FONTS },
];

const loaded = new Set<string>();

export async function loadFont(family: string): Promise<void> {
  const font = FONTS.find((f) => f.value === family);
  if (!font || loaded.has(family)) return;

  if (font.google) {
    const param = encodeURIComponent(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${param}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  } else if (font.local && font.file) {
    const ext = (font.file.split(".").pop() ?? "ttf").toLowerCase();
    const isOtf = ext === "otf";
    const format = isOtf ? "opentype" : "truetype";
    const baseUrl = (process.env.NEXT_PUBLIC_FONTS_BASE_URL ?? "").replace(/\/$/, "") || "/khmer%20font";
    const encodedFile = font.file.split("").map((ch) => {
      if (/[A-Za-z0-9\-_.~]/.test(ch)) return ch;
      return encodeURIComponent(ch);
    }).join("");
    const encodedPath = `${baseUrl}/${encodedFile}`;

    const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    // Use FontFace API directly — gives us a reliable load promise
    const face = new FontFace(family, `url("${encodedPath}") format("${format}")`);
    document.fonts.add(face);
    try {
      await face.load();
    } catch {
      // Fall back: inject @font-face and wait for the font to appear in FontFaceSet
      const style = document.createElement("style");
      style.textContent = `@font-face { font-family: "${escaped}"; src: url("${encodedPath}") format("${format}"); font-display: block; }`;
      document.head.appendChild(style);
      try {
        await document.fonts.load(`normal 400 16px "${family}"`);
      } catch {
        // best-effort — continue even if font check fails
      }
    }
    loaded.add(family);
    return;
  } else {
    return;
  }

  // For Google Fonts: wait until the font is actually usable (not just stylesheet inserted)
  try {
    await document.fonts.load(`normal 400 16px "${family}"`);
    await document.fonts.load(`bold 700 16px "${family}"`);
  } catch {
    await document.fonts.ready;
  }
  loaded.add(family);
}
