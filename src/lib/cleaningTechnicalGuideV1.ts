import {
  resolveShowerProcedure,
  showerLocationOptions,
  showerObservationOptions,
  showerSurfaceOptions,
  type GuideAnswers,
  type GuideOption,
  type TechnicalProcedure,
} from "@/lib/cleaningTechnicalGuide";

export type GuideAreaKey = "shower" | "toilet" | "kitchen" | "windows";

export type GuideAreaConfig = {
  key: GuideAreaKey;
  label: string;
  description: string;
  searchAliases: string[];
  observations: GuideOption[];
  surfaces: GuideOption[];
  locations: GuideOption[];
};

const toiletObservations: GuideOption[] = [
  { key: "hinges", label: "Grime around hinges or fixings", image: "/technical-guide/toilet/hinges.webp" },
  { key: "mineral-marks", label: "White or chalky bowl marks", image: "/technical-guide/toilet/mineral-marks.webp" },
  { key: "dark-spots", label: "Dark spots around the base or seal", image: "/technical-guide/toilet/dark-spots.webp" },
  { key: "damage", label: "Loose, cracked or damaged fitting", image: "/technical-guide/toilet/damage.webp" },
  { key: "unsure", label: "I’m not sure" },
];

const kitchenObservations: GuideOption[] = [
  { key: "grease", label: "Greasy film or grease migration", image: "/technical-guide/kitchen/grease.webp" },
  { key: "baked-residue", label: "Baked-on food residue", image: "/technical-guide/kitchen/baked-residue.webp" },
  { key: "crumbs-sticky", label: "Crumbs or sticky residue in an edge", image: "/technical-guide/kitchen/crumbs-sticky.webp" },
  { key: "damage", label: "Swelling, peeling or discolouration", image: "/technical-guide/kitchen/damage.webp" },
  { key: "unsure", label: "I’m not sure" },
];

const windowObservations: GuideOption[] = [
  { key: "fingerprints", label: "Fingerprints or ordinary glass film", image: "/technical-guide/windows/fingerprints.webp" },
  { key: "track-debris", label: "Dust, insects or debris in the track", image: "/technical-guide/windows/tracks.webp" },
  { key: "dark-spots", label: "Dark spots on the frame or sill", image: "/technical-guide/windows/dark-spots.webp" },
  { key: "damage", label: "Peeling, swelling or failed seal", image: "/technical-guide/windows/damage.webp" },
  { key: "unsure", label: "I’m not sure" },
];

const toiletSurfaces: GuideOption[] = [
  { key: "ceramic", label: "Ceramic bowl" }, { key: "plastic", label: "Plastic seat or fitting" },
  { key: "metal", label: "Metal hinge or fixing" }, { key: "seal", label: "Sealant or flexible seal" },
  { key: "unsure", label: "I’m not sure" },
];

const kitchenSurfaces: GuideOption[] = [
  { key: "tile-glass", label: "Tile or glass" }, { key: "stainless-metal", label: "Stainless steel or metal" },
  { key: "laminate-painted", label: "Laminate or painted cabinet" }, { key: "plastic-rubber", label: "Plastic or rubber seal" },
  { key: "unsure", label: "I’m not sure" },
];

const windowSurfaces: GuideOption[] = [
  { key: "glass", label: "Glass" }, { key: "aluminium", label: "Aluminium frame or track" },
  { key: "painted-timber", label: "Painted timber" }, { key: "plastic-rubber", label: "Plastic or rubber seal" },
  { key: "unsure", label: "I’m not sure" },
];

export const areaConfigs: Record<GuideAreaKey, GuideAreaConfig> = {
  shower: {
    key: "shower", label: "Shower", description: "Screens, tiles, grout, seals and tracks",
    searchAliases: ["shower", "bathroom", "body fat", "bodyfat", "soap scum", "grout", "scale"],
    observations: showerObservationOptions, surfaces: showerSurfaceOptions, locations: showerLocationOptions,
  },
  toilet: {
    key: "toilet", label: "Toilet", description: "Bowl, seat hinges, fixings, base and seals",
    searchAliases: ["toilet", "loo", "bowl", "toilet hinge", "toilet base", "urine scale"],
    observations: toiletObservations, surfaces: toiletSurfaces,
    locations: [
      { key: "bowl", label: "Inside the bowl" }, { key: "seat-hinge", label: "Seat, hinge or fixing" },
      { key: "base-seal", label: "Base or floor seal" }, { key: "cistern-controls", label: "Cistern or controls" },
      { key: "unsure", label: "I’m not sure" },
    ],
  },
  kitchen: {
    key: "kitchen", label: "Kitchen", description: "Grease, splashbacks, cabinets and appliance edges",
    searchAliases: ["kitchen", "grease", "oven", "cooktop", "splashback", "cabinet", "appliance"],
    observations: kitchenObservations, surfaces: kitchenSurfaces,
    locations: [
      { key: "cooktop-splashback", label: "Cooktop or splashback" }, { key: "cabinet", label: "Cabinet face, edge or top" },
      { key: "appliance-edge", label: "Accessible appliance edge" }, { key: "bench-sink", label: "Bench or sink area" },
      { key: "unsure", label: "I’m not sure" },
    ],
  },
  windows: {
    key: "windows", label: "Windows", description: "Interior glass, frames, sills and accessible tracks",
    searchAliases: ["window", "windows", "glass", "window track", "sill", "frame", "fingerprints"],
    observations: windowObservations, surfaces: windowSurfaces,
    locations: [
      { key: "pane", label: "Interior glass pane" }, { key: "track", label: "Accessible track" },
      { key: "frame", label: "Frame or seal" }, { key: "sill", label: "Interior sill" },
      { key: "unsure", label: "I’m not sure" },
    ],
  },
};

export const cleaningAreaOptionsV1 = Object.values(areaConfigs).map(({ key, label, description }) => ({ key, label, description }));

export function findAreaForSearch(value: string): GuideAreaKey | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return (Object.values(areaConfigs).find((area) => area.searchAliases.some((alias) => alias.includes(normalized) || normalized.includes(alias)))?.key ?? null);
}

const sources = [
  { label: "Safe Work Australia — using safety data sheets", url: "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/safety-data-sheets/using-safety-data-sheets" },
  { label: "Safe Work Australia — hazardous chemical labels", url: "https://www.safeworkaustralia.gov.au/safety-topic/hazards/chemicals/labelling-hazardous-chemicals/information-hazardous-chemical-labels" },
];

const mouldSources = [
  { label: "Queensland Health — mould guidance", url: "https://www.health.qld.gov.au/public-health/disaster/public-health-advice/mould" },
  { label: "SafeWork NSW — mould at work", url: "https://www.safework.nsw.gov.au/hazards-a-z/mould" },
  ...sources,
];

function baseProcedure(input: Omit<TechnicalProcedure, "status" | "confidence" | "sources" | "reviewNote"> & { sources?: TechnicalProcedure["sources"] }): TechnicalProcedure {
  return {
    ...input,
    confidence: "Likely",
    status: "Source-backed draft",
    sources: input.sources ?? sources,
    reviewNote: "Field-method direction approved. Independent chemical and surface-compatibility review remains required before production certification.",
  };
}

const areaProcedures: Record<string, TechnicalProcedure> = {
  "toilet:hinges": baseProcedure({
    key: "toilet-hinges", title: "Detail toilet hinges and concealed fixings",
    likelyCondition: "Ordinary dust, splash residue and organic contamination have collected around accessible seat hinges and fixings.",
    purpose: "Remove accessible contamination without forcing liquid into mechanisms or damaging plastic and plated fittings.",
    tools: ["Disposable gloves", "Colour-controlled toilet cloths", "Small soft brush", "Surface-compatible labelled detergent or bathroom cleaner"],
    steps: [
      { title: "Isolate the tools", instruction: "Use toilet-only colour-controlled cloths and gloves. Do not carry the cloth into another room or surface." },
      { title: "Inspect the fitting", instruction: "Check for looseness, cracks, corrosion and concealed gaps. Do not dismantle a fixing unless the scope and manufacturer method allow it." },
      { title: "Remove loose material first", instruction: "Lift accessible dry debris with a disposable method before adding product. Avoid sprays near open mechanisms." },
      { title: "Clean with controlled moisture", instruction: "Apply the labelled product to the cloth or brush when possible. Work around the accessible hinge and fixing without flooding it." },
      { title: "Rinse if required, dry and check", instruction: "Remove product residue as the label directs, dry the fitting and confirm that it remains secure and moves normally." },
    ],
    expectedOutcome: ["Accessible residue is removed.", "The hinge remains secure and functional.", "No standing liquid or cleaner residue remains."],
    stopConditions: ["Loose seat, cracked plastic or exposed sharp metal", "Corrosion or leakage", "A fixing requires dismantling outside the agreed scope"],
    customerExplanation: "I detailed the accessible seat hinges and fixings and checked that they remained secure. Any looseness or damage is recorded separately because cleaning will not repair it.",
  }),
  "toilet:mineral-marks": baseProcedure({
    key: "toilet-mineral-marks", title: "Check white or chalky bowl marks",
    likelyCondition: "The marks may be mineral scale, but residue, staining or damaged glaze can look similar.",
    purpose: "Use a labelled bowl treatment only after confirming an intact ceramic surface and known chemical history.",
    tools: ["Disposable gloves and label-stated PPE", "Toilet-only brush", "Product specifically labelled for toilet-bowl scale on ceramic"],
    steps: [
      { title: "Confirm the bowl and chemical history", instruction: "Proceed only on intact ceramic when the previous product is known. Do not add an acidic product over bleach or an unknown cleaner." },
      { title: "Read the label and ventilate", instruction: "Follow the product dilution, contact time, PPE and ventilation directions exactly. Never extend dwell time by guesswork." },
      { title: "Treat only the marked area", instruction: "Apply as directed and use the toilet-only brush. Do not use metal scrapers, abrasive stones or improvised acids." },
      { title: "Flush, inspect and stop if unchanged", instruction: "Remove the product as directed. If the dry mark remains or the glaze looks etched, record it rather than repeatedly treating it." },
    ],
    expectedOutcome: ["Removable scale is reduced without glaze damage.", "Permanent staining or damaged glaze is identified rather than overworked."],
    stopConditions: ["Unknown or mixed previous chemicals", "Cracked, crazed or damaged glaze", "Strong fumes, irritation or poor ventilation", "No suitable labelled product"],
    customerExplanation: "I treated the removable bowl deposit using a ceramic-compatible labelled method. Any mark that remains may be staining or glaze damage rather than ordinary residue.",
  }),
  "toilet:dark-spots": baseProcedure({
    key: "toilet-dark-spots", title: "Clean limited dark spotting on a sound base seal",
    likelyCondition: "The spotting may be limited surface mould associated with moisture, but failed sealant or leakage can look similar.",
    purpose: "Clean only a small sound washable area and identify any moisture or repair issue.",
    tools: ["Disposable gloves", "Eye protection", "Damp disposable cloths", "Mild labelled detergent"],
    steps: [
      { title: "Check for movement or leakage", instruction: "Do not proceed if the toilet moves, the seal is split, the floor is wet or there is evidence of leakage." },
      { title: "Avoid dry brushing", instruction: "Wear gloves and eye protection. Use a damp method so material is not brushed into the air." },
      { title: "Clean the sound surface", instruction: "Use mild detergent on the accessible washable area, then remove residue and dry completely." },
      { title: "Record recurrence risk", instruction: "Report failed sealant, recurring moisture or growth beyond the small ordinary-cleaning boundary." },
    ],
    expectedOutcome: ["Limited surface spotting is removed from a sound washable seal.", "Leakage or failed sealant is escalated."],
    stopConditions: ["Movement, leakage or odour from beneath the toilet", "Split, missing or perished seal", "Widespread or recurring growth", "Porous or damaged flooring"],
    customerExplanation: "I cleaned the limited surface spotting and dried the area. I have separately noted any seal or moisture issue because cleaning cannot repair a leak or failed fitting.",
    sources: mouldSources,
  }),
  "kitchen:grease": baseProcedure({
    key: "kitchen-grease", title: "Remove ordinary kitchen grease migration",
    likelyCondition: "Airborne cooking grease has settled beyond the immediate cooktop and formed a sticky film on nearby surfaces and edges.",
    purpose: "Remove grease progressively without spreading it or damaging coatings, paint, laminate, glass or metal.",
    tools: ["Gloves and label-stated PPE", "Several clean microfibre cloths", "Surface-compatible labelled degreaser or mild detergent", "Non-scratch pad approved for the surface"],
    steps: [
      { title: "Make the area safe", instruction: "Confirm appliances and hot surfaces are cool. Isolate power where the manufacturer requires it and keep liquid away from electrical openings." },
      { title: "Identify every surface", instruction: "Separate glass, tile, painted, laminate, metal and porous areas. One product may not be suitable for all of them." },
      { title: "Test and work from clean to greasy", instruction: "Test a hidden spot. Apply as labelled and work in small sections, changing cloth faces often so grease is lifted rather than spread." },
      { title: "Remove residue and inspect", instruction: "Rinse when required, dry, then inspect at an angle for streaks, remaining tackiness or finish change." },
    ],
    expectedOutcome: ["The sticky film is removed without spreading it.", "The original finish remains even.", "No cleaner residue or greasy cloth marks remain."],
    stopConditions: ["Hot or live appliance", "Unknown coating, unsealed stone or swollen laminate", "Finish softens, fades or becomes dull", "Grease is inside an electrical or inaccessible cavity"],
    customerExplanation: "Cooking grease had migrated onto nearby surfaces. I separated the surface types, used compatible methods and checked the finish after drying.",
  }),
  "kitchen:baked-residue": baseProcedure({
    key: "kitchen-baked-residue", title: "Treat baked-on residue on a safe accessible surface",
    likelyCondition: "Heat has hardened food or grease residue around an accessible appliance edge.",
    purpose: "Soften and remove residue using the appliance manufacturer’s approved method, without scraping coatings or wetting electrical parts.",
    tools: ["Gloves and label-stated PPE", "Manufacturer-approved cleaner", "Non-scratch pad or plastic tool approved for the surface", "Clean cloths"],
    steps: [
      { title: "Cool, isolate and read the manual", instruction: "The appliance must be cool. Follow the manufacturer’s cleaning and power-isolation instructions before touching edges, seals or doors." },
      { title: "Protect vulnerable parts", instruction: "Do not soak heating elements, door seals, vents, controls or electrical openings." },
      { title: "Soften rather than force", instruction: "Use only the approved cleaner and contact time. Work with a non-scratch tool; do not use metal blades or steel wool." },
      { title: "Remove residue and restore", instruction: "Wipe away loosened material and cleaner residue. Dry fully and restore the appliance only as the manual directs." },
    ],
    expectedOutcome: ["Accessible baked residue is reduced without scratching.", "Seals, coatings and controls remain intact and dry."],
    stopConditions: ["Hot, connected or unsafe appliance", "Damaged seal, glass or coating", "Residue requires dismantling", "Manufacturer instructions are unavailable"],
    customerExplanation: "I treated the accessible baked-on residue using the appliance-approved method. I stopped short of dismantling or damaging protected parts.",
  }),
  "kitchen:crumbs-sticky": baseProcedure({
    key: "kitchen-edges", title: "Detail accessible kitchen and appliance edges",
    likelyCondition: "Loose crumbs and sticky food residue have collected in an accessible edge, channel or cabinet junction.",
    purpose: "Remove loose material before controlled damp cleaning, without pushing debris or liquid into a cavity.",
    tools: ["Gloves", "Dry pickup tool or vacuum attachment approved for the area", "Soft detail brush", "Damp microfibre cloth", "Mild surface-compatible detergent"],
    steps: [
      { title: "Check access and power", instruction: "Do not work inside live equipment, sealed cavities or sharp inaccessible spaces. Follow appliance isolation instructions." },
      { title: "Dry pickup first", instruction: "Lift crumbs and loose debris before adding moisture. Keep the pickup tool clean and food-area appropriate." },
      { title: "Use controlled moisture", instruction: "Apply a small amount of mild labelled cleaner to the cloth or brush, not into the cavity. Agitate the accessible edge and lift the residue." },
      { title: "Dry and inspect", instruction: "Remove cleaner residue, dry the channel and confirm no debris was pushed deeper." },
    ],
    expectedOutcome: ["Accessible crumbs and sticky residue are removed.", "No liquid or debris is forced into equipment or cabinetry."],
    stopConditions: ["Electrical opening, sharp edge or inaccessible cavity", "Pest activity or biological contamination", "Swollen cabinetry or damaged seal"],
    customerExplanation: "I removed the loose material first, then detailed the accessible edge with controlled moisture so debris and liquid were not pushed into the unit.",
  }),
  "windows:fingerprints": baseProcedure({
    key: "window-glass", title: "Clean ordinary interior glass film",
    likelyCondition: "Fingerprints, airborne dust and ordinary household film are present on accessible interior glass.",
    purpose: "Remove film without streaks while protecting coatings, frames and nearby finishes.",
    tools: ["Clean lint-free or microfibre cloths", "Labelled glass cleaner compatible with the pane", "Gloves when required by the label"],
    steps: [
      { title: "Confirm safe access and the glass type", instruction: "Work only from a safe floor-level position. Identify films, tint, coatings or special glass before selecting a product." },
      { title: "Remove loose dust", instruction: "Use a clean dry method so grit is not dragged across the pane." },
      { title: "Use a small controlled amount", instruction: "Apply the labelled cleaner to the cloth when overspray could reach frames, walls or electronics. Wipe in overlapping passes." },
      { title: "Finish and inspect at an angle", instruction: "Use a clean dry cloth edge to finish. Check from more than one angle for streaks and missed edges." },
    ],
    expectedOutcome: ["Fingerprints and ordinary film are removed.", "The glass is streak-free from normal viewing angles.", "Frames and coatings remain dry and unchanged."],
    stopConditions: ["Unsafe height or exterior reach", "Unknown film, tint or coating", "Cracked glass or loose pane", "Construction residue requiring specialist removal"],
    customerExplanation: "I cleaned the accessible interior glass and checked it from several angles. Any coating damage or inaccessible exterior work is identified separately.",
  }),
  "windows:track-debris": baseProcedure({
    key: "window-track", title: "Clean accessible window tracks",
    likelyCondition: "Dust, insects and outdoor debris have collected in the accessible track and drainage channel.",
    purpose: "Remove dry debris first, then detail without flooding drainage paths or damaging seals.",
    tools: ["Gloves", "Safe dry pickup or narrow vacuum attachment", "Soft brush", "Damp cloth", "Mild surface-compatible detergent"],
    steps: [
      { title: "Inspect the track", instruction: "Check for sharp debris, pests, corrosion, damaged seals and safe access before touching the material." },
      { title: "Dry pickup first", instruction: "Remove loose dust and insects with a suitable pickup method. Do not blow debris into the room or drainage cavity." },
      { title: "Detail with controlled moisture", instruction: "Use a soft brush and lightly damp cloth with mild labelled detergent. Do not flood the track." },
      { title: "Clear and dry", instruction: "Leave accessible drainage openings clear, remove residue and dry the track." },
    ],
    expectedOutcome: ["Accessible loose debris and residue are removed.", "Drainage openings remain clear.", "No standing liquid remains."],
    stopConditions: ["Sharp debris, pests or biological contamination", "Corrosion, loose frame or damaged seal", "Unsafe exterior access"],
    customerExplanation: "I removed the dry debris first, detailed the accessible track and left the drainage path clear without flooding the frame.",
  }),
  "windows:dark-spots": baseProcedure({
    key: "window-dark-spots", title: "Clean limited mould-like spotting on a sound frame",
    likelyCondition: "The spotting may be limited surface mould associated with condensation, but water entry or coating failure can look similar.",
    purpose: "Clean only a small sound washable area and identify the moisture source.",
    tools: ["Gloves", "Eye protection", "Damp cloths", "Mild labelled detergent", "P2 mask when the risk assessment or guidance requires it"],
    steps: [
      { title: "Check the boundary", instruction: "Proceed only for a small area on a sound washable interior frame or sill. Stop for widespread growth, water damage or unsafe access." },
      { title: "Avoid dry brushing", instruction: "Use a damp method and suitable PPE so material is not brushed into the air." },
      { title: "Clean and dry", instruction: "Use mild detergent on the compatible surface, remove residue and dry the area completely." },
      { title: "Record the moisture cause", instruction: "Note condensation, failed seals, water entry or recurring damp. Cleaning alone will not correct those causes." },
    ],
    expectedOutcome: ["Limited surface spotting is removed from a sound washable surface.", "The area is dry and the moisture source is recorded."],
    stopConditions: ["Widespread or recurring growth", "Peeling paint, swollen timber or water entry", "Respiratory sensitivity or symptoms", "Unsafe height or exterior access"],
    customerExplanation: "I cleaned the limited surface spotting and dried the area. I also recorded the condensation or water-entry issue because repeated cleaning will not fix the cause.",
    sources: mouldSources,
  }),
};

export function resolveAreaProcedure(area: GuideAreaKey, answers: GuideAnswers): TechnicalProcedure {
  if (area === "shower") return resolveShowerProcedure(answers);
  if (["unknown", "mixed"].includes(answers.previousProduct ?? "") || [answers.observation, answers.surface, answers.location].includes("unsure") || answers.observation === "damage") {
    return resolveShowerProcedure({ ...answers, observation: "damage" });
  }
  return areaProcedures[`${area}:${answers.observation}`] ?? resolveShowerProcedure({ ...answers, observation: "damage" });
}
