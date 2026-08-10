export type GuideOption = {
  key: string;
  label: string;
  description?: string;
  image?: string;
};

export type GuideAnswers = {
  observation?: string;
  surface?: string;
  location?: string;
  previousProduct?: string;
};

export type ProcedureStep = {
  title: string;
  instruction: string;
  image?: string;
};

export type TechnicalProcedure = {
  key: string;
  title: string;
  likelyCondition: string;
  confidence: "Likely" | "Possible" | "Unresolved";
  status: "Source-backed draft" | "Stop and escalate";
  purpose: string;
  tools: string[];
  steps: ProcedureStep[];
  expectedOutcome: string[];
  stopConditions: string[];
  customerExplanation: string;
  sources: { label: string; url: string }[];
  reviewNote: string;
};

export const cleaningAreaOptions: GuideOption[] = [
  { key: "shower", label: "Shower", description: "Screens, tiles, grout, seals and tracks" },
  { key: "toilet", label: "Toilet", description: "Next reviewed procedure batch" },
  { key: "kitchen", label: "Kitchen", description: "Next reviewed procedure batch" },
  { key: "windows", label: "Windows", description: "Next reviewed procedure batch" },
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
  "shower", "shower screen", "bathroom", "body fat", "bodyfat", "body oil",
  "greasy film", "soap scum", "white marks", "scale", "grout", "shower track",
  "mould", "mold", "seal", "silicone", "calcium", "water marks",
];

export function searchMatchesShower(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return showerSearchAliases.some((alias) => alias.includes(normalized) || normalized.includes(alias));
}

export function observationSummary(key: string) {
  return showerObservationOptions.find((option) => option.key === key)?.label ?? "Unknown condition";
}

const chemicalSources = [
  { label: "Safe Work Australia — using safety data sheets", url: "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/safety-data-sheets/using-safety-data-sheets" },
  { label: "Safe Work Australia — hazardous chemical labels", url: "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/labelling-hazardous-chemicals/information-hazardous-chemical-labels" },
];

const sharedPreparation: ProcedureStep[] = [
  {
    title: "Read the label and ventilate",
    instruction: "Confirm that the product is labelled for the exact surface and task. Read the directions and SDS, put on the stated PPE, and ventilate the room before starting.",
    image: "/technical-guide/procedure/read-label-and-ventilate.webp",
  },
];

const sharedFinish: ProcedureStep = {
  title: "Rinse, dry and inspect",
  instruction: "Remove the loosened residue as the label directs. Rinse when the product requires it, dry with a clean cloth, then inspect across the surface under good light.",
  image: "/technical-guide/procedure/rinse-dry-inspect.webp",
};

const stopProcedure: TechnicalProcedure = {
  key: "stop",
  title: "Stop before applying another product",
  likelyCondition: "The condition or chemical history is not clear enough for a safe treatment decision.",
  confidence: "Unresolved",
  status: "Stop and escalate",
  purpose: "Protect the cleaner, customer and surface while the missing information is confirmed.",
  tools: ["Phone camera or written note", "Original product container, if available"],
  steps: [
    { title: "Do not add another chemical", instruction: "Keep people away from the wet or affected area. Do not try to neutralise, dilute or cover an unknown product unless its label or a competent adviser specifically directs that action." },
    { title: "Record what you can observe", instruction: "Photograph the area without identifying the customer. Record the surface, location, odour, damage and any product container that is present." },
    { title: "Ask before continuing", instruction: "Contact the supervisor, product manufacturer, property contact or another competent person. Continue only when the surface and previous product are identified and a compatible method is confirmed." },
  ],
  expectedOutcome: ["No additional exposure or surface damage is created.", "The missing information is identified before work resumes."],
  stopConditions: ["Strong fumes, breathing difficulty, eye or skin exposure", "Unknown or mixed products", "Damaged, peeling, swollen, cracked or delaminating surface", "No ventilation, PPE or safe access"],
  customerExplanation: "I’ve paused this part because the existing product or surface is not clear. I do not want to guess and cause damage, so I’ll confirm the safe method before continuing.",
  sources: chemicalSources,
  reviewNote: "This is a controlling stop pathway. Emergency exposure must follow the product label/SDS and emergency services or the Poisons Information Centre as appropriate.",
};

const procedures: Record<string, TechnicalProcedure> = {
  "greasy-film": {
    key: "greasy-film",
    title: "Remove ordinary organic and soap film",
    likelyCondition: "A surface film made up of body oils, skin residue, soap and personal-care products is likely.",
    confidence: "Likely",
    status: "Source-backed draft",
    purpose: "Lift the film without scratching the surface or leaving product residue behind.",
    tools: ["Clean microfibre cloths", "Non-scratch pad approved for the surface", "Gloves and any PPE stated on the label", "Surface-compatible neutral or mild detergent cleaner"],
    steps: [
      ...sharedPreparation,
      { title: "Test a small hidden area", instruction: "Apply the labelled dilution or ready-to-use product to a small inconspicuous area. Stop if the finish changes, softens, dulls or discolours." },
      { title: "Work gently in sections", instruction: "Apply only as the label directs. Use a clean cloth or approved non-scratch pad with gentle overlapping passes. Keep the section manageable and do not let product dry on the surface.", image: "/technical-guide/procedure/gentle-clean.webp" },
      sharedFinish,
    ],
    expectedOutcome: ["The greasy feel and visible film are removed.", "The original surface finish remains even and undamaged.", "No cleaner residue, streaks or standing water remain."],
    stopConditions: ["The film remains after one controlled pass", "The surface becomes dull, sticky, soft or discoloured", "The surface or coating is not known", "Strong odour or irritation develops"],
    customerExplanation: "The shower had a normal buildup of soap and organic residue. I used a surface-compatible method, removed the loosened film and checked the finish after drying.",
    sources: chemicalSources,
    reviewNote: "Ready for Gai’s field-method review and independent surface/chemical compatibility sign-off before production publication.",
  },
  "white-marks": {
    key: "white-marks",
    title: "Check and treat white mineral-like marks",
    likelyCondition: "The marks may be dried mineral deposits, but soap residue or surface damage can look similar.",
    confidence: "Possible",
    status: "Source-backed draft",
    purpose: "Confirm that the mark is removable residue before using a product intended for mineral deposits.",
    tools: ["Clean microfibre cloths", "Gloves and label-stated PPE", "Neutral detergent for the first check", "Only a descaling product specifically labelled for the identified surface, if required"],
    steps: [
      ...sharedPreparation,
      { title: "Start with the mild check", instruction: "Clean a small section with a surface-compatible neutral detergent. Dry it fully. If the white mark disappears, complete the area with that method." },
      { title: "Escalate the product, not the force", instruction: "If the mark remains and the surface is confirmed, use only a product whose label names that surface and mineral-deposit task. Follow its dilution and contact time exactly. Do not improvise an acid or scrape the mark." },
      sharedFinish,
    ],
    expectedOutcome: ["Removable white residue is reduced without scratching or dulling.", "Permanent etching or coating damage is recognised rather than repeatedly scrubbed."],
    stopConditions: ["Natural stone, coated glass, plated metal or an unknown finish", "The mark looks unchanged when wet and dry", "Pitting, etching, flaking or permanent cloudiness", "No suitable labelled product is available"],
    customerExplanation: "The white marks may be mineral buildup, but similar marks can be permanent surface change. I used the mildest suitable check first and stopped rather than damage the finish.",
    sources: chemicalSources,
    reviewNote: "Requires independent surface review for glass coatings, acrylic, grout, plated fittings and any product-category examples before production publication.",
  },
  "dark-spots": {
    key: "dark-spots",
    title: "Clean a small, ordinary mould-like surface area",
    likelyCondition: "The spotting may be surface mould associated with persistent moisture, but staining or failed sealant can look similar.",
    confidence: "Possible",
    status: "Source-backed draft",
    purpose: "Remove limited surface contamination safely and identify moisture or material failure that needs escalation.",
    tools: ["Gloves", "Eye protection", "P2 mask when the risk assessment or guidance requires it", "Mild detergent and clean cloths", "Disposable bag for contaminated cloths if appropriate"],
    steps: [
      { title: "Check the boundary", instruction: "Proceed only for a small area on a sound, washable surface with good ventilation. Stop for widespread growth, recurring damp, porous damaged material or health concerns." },
      { title: "Protect yourself and avoid dry brushing", instruction: "Wear gloves and eye protection. Do not dry-brush or aggressively scrub mould-like growth because this can release material into the air." },
      { title: "Clean the surface", instruction: "Use mild detergent and a damp cloth on a compatible washable surface. Work without creating spray or airborne dust. Follow any product label and SDS." },
      { title: "Dry and inspect the cause", instruction: "Dry the area completely. Check for a leak, failed seal, poor ventilation or recurring moisture and report it rather than treating repeated growth as an ordinary cleaning failure." },
    ],
    expectedOutcome: ["Limited surface growth is physically removed from a sound washable surface.", "The area is dry and the likely moisture source is recorded.", "Failed sealant or structural moisture is escalated."],
    stopConditions: ["Widespread, recurring or heavy growth", "Porous, swollen, crumbling or water-damaged material", "A person has respiratory sensitivity or develops symptoms", "Suspected leak, failed waterproofing or concealed contamination"],
    customerExplanation: "I removed the limited surface growth and dried the area. I also noted the moisture or material issue because cleaning alone will not solve recurring growth.",
    sources: [
      { label: "Queensland Health — mould after a disaster", url: "https://www.health.qld.gov.au/public-health/disaster/public-health-advice/mould" },
      { label: "SafeWork NSW — mould at work", url: "https://www.safework.nsw.gov.au/hazards-a-z/mould" },
      ...chemicalSources,
    ],
    reviewNote: "Limited ordinary-cleaning boundary only. Requires Gai’s field review and a competent WHS/technical review before production publication.",
  },
  "seals-tracks": {
    key: "seals-tracks",
    title: "Detail shower seals, tracks and corners",
    likelyCondition: "Loose debris, wet organic residue and soap buildup commonly collect in narrow tracks, seals and corners.",
    confidence: "Likely",
    status: "Source-backed draft",
    purpose: "Remove trapped residue without cutting seals, scratching channels or forcing water into inaccessible cavities.",
    tools: ["Vacuum or dry pickup method suitable for loose debris", "Soft detail brush", "Microfibre cloths", "Surface-compatible mild detergent", "Gloves and label-stated PPE"],
    steps: [
      { title: "Inspect before wetting", instruction: "Check whether the seal is loose, split, mould-stained or perished and whether the track drains normally. Photograph damage before cleaning." },
      { title: "Remove loose debris", instruction: "Lift accessible loose hair and debris before adding moisture. Do not use blades, metal picks or sharp tools against seals and coated tracks." },
      ...sharedPreparation,
      { title: "Detail without flooding", instruction: "Use a small amount of labelled mild cleaner with a soft brush or cloth. Work along the accessible channel and corners. Do not force liquid into wall cavities, damaged seals or fittings." },
      sharedFinish,
    ],
    expectedOutcome: ["Accessible loose debris and residue are removed.", "Drainage openings remain clear.", "Seals and finishes remain intact, with permanent staining or damage reported."],
    stopConditions: ["Split, loose, perished or missing sealant", "Standing water that will not drain", "Rust, coating loss or sharp damaged metal", "Growth or residue extends into an inaccessible cavity"],
    customerExplanation: "I detailed the accessible seals and tracks and removed the trapped residue. I have identified any staining, failed seal or drainage issue separately because cleaning cannot repair it.",
    sources: chemicalSources,
    reviewNote: "Ready for Gai’s tool and sequence review and independent surface compatibility sign-off before production publication.",
  },
};

export function resolveShowerProcedure(answers: GuideAnswers): TechnicalProcedure {
  if (
    answers.previousProduct === "unknown" ||
    answers.previousProduct === "mixed" ||
    answers.observation === "unsure" ||
    answers.surface === "unsure" ||
    answers.location === "unsure" ||
    answers.observation === "damage"
  ) return stopProcedure;

  return procedures[answers.observation ?? ""] ?? stopProcedure;
}
