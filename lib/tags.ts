// Tags used to be a hardcoded list (lib/events.ts's old EVENT_TAGS). They're
// now a shared, database-backed, team-editable list — colors, though, stay
// a curated palette rather than free-form hex: picking from ten
// pre-balanced, dark-mode-safe colors is a lot harder to get visually wrong
// than a raw color picker, and it keeps every tag looking like part of the
// same system instead of a grab bag.
export const TAG_COLORS = [
  "navy",
  "pesto",
  "earn",
  "holiday",
  "webinar",
  "ierm",
  "slate",
  "violet",
  "rose",
  "forest",
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export function isTagColor(value: unknown): value is TagColor {
  return typeof value === "string" && (TAG_COLORS as readonly string[]).includes(value);
}

export type TagDef = {
  id: string;
  label: string;
  color: TagColor;
  // A highlighted tag gets a bordered pill and an accented card wherever it
  // appears — originally just for InsuranceERM's own events, now something
  // any tag can opt into.
  highlight: boolean;
  sortOrder: number;
};

export function rowToTag(row: any): TagDef {
  return {
    id: row.id,
    label: row.label,
    color: isTagColor(row.color) ? row.color : "slate",
    highlight: !!row.highlight,
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
  };
}

// Seeded into the `tags` table once, the first time it's empty — see
// ensureSchema() in lib/db.ts. Keeps existing deployments' events (already
// tagged "event", "earnings", etc.) resolving correctly after the upgrade.
export const BUILTIN_TAGS: Array<{ id: string; label: string; color: TagColor; highlight: boolean }> = [
  { id: "event", label: "Industry event", color: "navy", highlight: false },
  { id: "earnings", label: "Earnings", color: "earn", highlight: false },
  { id: "editorial", label: "Editorial", color: "pesto", highlight: false },
  { id: "holiday", label: "Bank Holiday", color: "holiday", highlight: false },
  { id: "insuranceerm", label: "InsuranceERM Event", color: "ierm", highlight: true },
  { id: "webinar", label: "Webinar", color: "webinar", highlight: false },
];

// Turns a typed label into a stable, url-safe id. Caller is responsible for
// appending a numeric suffix on collision with an existing tag id.
export function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "tag";
}
