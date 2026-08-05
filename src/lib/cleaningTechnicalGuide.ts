export type GuideOption = {
  key: string;
  label: string;
  description?: string;
  image?: string;
};

export const cleaningAreaOptions: GuideOption[] = [
  { key: "shower", label: "Shower", description: "Screens, tiles, grout, seals and tracks" },
  { key: "toilet", label: "Toilet", description: "Coming after the shower pilot" },
  { key: "kitchen", label: "Kitchen", description: "Coming after the shower pilot" },
  { key: "windows", label: "Windows", description: "Coming after the shower pilot" },
];

export const showerObservationOptions: GuideOption[] = [
  { key: "greasy-film", label: "Greasy or sticky film", image: "/technical-guide/shower/greasy-film.webp" },
  { key: "white-marks", label: "White or chalky marks", image: "/technical-guide/shower/white-marks.webp" },
  { key: "dark-spots", label: "Dark spots or growth", image: "/technical-guide/shower/dark-spots.webp" },
  { key: "seals-tracks", label: "Dirt around seals or tracks", image: "/technical-guide/shower/seals-tracks.webp" },
  { key: "damage", label: "Damage or discolouration", image: "/technical-guide/shower/damage-discolouration.webp" },
  { key: "unsure", label: "I’m not sure" },
];

export const showerSurfaceOptions: GuideOption[] = [
  { key: "glass", label: "Glass" },
  { key: "tile", label: "Tile" },
  { key: "grout", label: "Grout" },
  { key: "metal", label: "Metal" },
  { key: "plastic-acrylic", label: "Plastic or acrylic" },
  { key: "unsure", label: "I’m not sure" },
];

export const showerLocationOptions: GuideOption[] = [
  { key: "screen", label: "Screen or door", description: "The broad glass or acrylic panel" },
  { key: "wall-floor", label: "Wall or floor", description: "Tiles, grout or the shower base" },
  { key: "edge-seal", label: "Edge or seal", description: "Flexible seals and panel edges" },
  { key: "track", label: "Track or corner", description: "Channels, joins and hidden corners" },
  { key: "fixture", label: "Tap or fitting", description: "Metal controls, handles and fittings" },
  { key: "unsure", label: "I’m not sure", description: "Stop and identify the exact area first" },
];

export const previousProductOptions: GuideOption[] = [
  { key: "nothing", label: "Nothing yet" },
  { key: "known", label: "I know exactly what was used" },
  { key: "unknown", label: "Something, but I’m not sure what" },
  { key: "mixed", label: "More than one product" },
];

export const showerSearchAliases = [
  "shower",
  "shower screen",
  "bathroom",
  "body fat",
  "bodyfat",
  "body oil",
  "greasy film",
  "soap scum",
  "white marks",
  "scale",
  "grout",
  "shower track",
];

export function searchMatchesShower(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return showerSearchAliases.some((alias) => alias.includes(normalized) || normalized.includes(alias));
}

export function observationSummary(key: string) {
  return showerObservationOptions.find((option) => option.key === key)?.label ?? "Unknown condition";
}
