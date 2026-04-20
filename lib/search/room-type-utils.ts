import type { RoomTypeOption } from "@/lib/search/search-query";

const UI_TO_DB_ROOM_TYPE_LABELS = {
  Standard: "Standard Room",
  Deluxe: "Deluxe Room",
  Family: "Family Suite",
  Executive: "Executive Suite",
} as const satisfies Record<Exclude<RoomTypeOption, "All">, string>;

const ROOM_TYPE_ALIASES = [
  {
    aliases: ["standard", "standard room"],
    canonicalLabel: "Standard Room",
  },
  {
    aliases: ["deluxe", "deluxe room"],
    canonicalLabel: "Deluxe Room",
  },
  {
    aliases: ["family", "family suite"],
    canonicalLabel: "Family Suite",
  },
  {
    aliases: ["executive", "executive suite"],
    canonicalLabel: "Executive Suite",
  },
] as const;

export function normalizeRoomTypeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function canonicalizeRoomTypeLabel(value: string) {
  const normalized = normalizeRoomTypeLabel(value);

  if (!normalized) {
    return null;
  }

  const matchedAlias = ROOM_TYPE_ALIASES.find((entry) => entry.aliases.some((alias) => alias === normalized));
  return matchedAlias?.canonicalLabel || value.trim();
}

export function getRequestedRoomTypeLabel(requestedRoomType: RoomTypeOption) {
  if (requestedRoomType === "All") {
    return null;
  }

  return UI_TO_DB_ROOM_TYPE_LABELS[requestedRoomType];
}

export function matchesRequestedRoomType(label: string, requestedRoomType: RoomTypeOption) {
  if (requestedRoomType === "All") {
    return true;
  }

  return normalizeRoomTypeLabel(label) === normalizeRoomTypeLabel(UI_TO_DB_ROOM_TYPE_LABELS[requestedRoomType]);
}
