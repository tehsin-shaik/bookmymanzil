import {
  calculateNightsBetweenDates,
  isDateInPast,
  parseIsoDateString,
} from "@/lib/search/date-utils";

export const ROOM_TYPE_OPTIONS = ["All", "Standard", "Deluxe", "Family", "Executive"] as const;

export type RoomTypeOption = (typeof ROOM_TYPE_OPTIONS)[number];

export type SearchQuery = {
  adults: number;
  checkIn: string;
  checkOut: string;
  children: number;
  location: string;
  nights: number;
  roomType: RoomTypeOption;
  rooms: number;
};

type SearchQueryState = {
  isValid: boolean;
  issues: string[];
  query: SearchQuery;
};

const DEFAULT_QUERY: SearchQuery = {
  adults: 2,
  checkIn: "",
  checkOut: "",
  children: 0,
  location: "",
  nights: 0,
  roomType: "All",
  rooms: 1,
};

export function parseSearchQuery(params: Record<string, string | string[] | undefined>): SearchQueryState {
  const location = readParam(params.location);
  const checkIn = readParam(params.checkIn);
  const checkOut = readParam(params.checkOut);
  const parsedCheckIn = parseIsoDateString(checkIn);
  const parsedCheckOut = parseIsoDateString(checkOut);
  const adults = parsePositiveInt(readParam(params.adults), 2, 1);
  const children = parsePositiveInt(readParam(params.children), 0, 0);
  const rooms = parsePositiveInt(readParam(params.rooms), 1, 1);
  const requestedRoomType = readParam(params.roomType);
  const roomType = ROOM_TYPE_OPTIONS.includes(requestedRoomType as RoomTypeOption)
    ? (requestedRoomType as RoomTypeOption)
    : DEFAULT_QUERY.roomType;
  const nights = calculateNightsBetweenDates(parsedCheckIn?.date ?? null, parsedCheckOut?.date ?? null);
  const issues: string[] = [];

  if (!location) {
    issues.push("Choose a destination to see available stays.");
  }

  if (!checkIn || !parsedCheckIn) {
    issues.push("Add a valid check-in date.");
  } else if (isDateInPast(parsedCheckIn.date)) {
    issues.push("Check-in can't be in the past.");
  }

  if (!checkOut || !parsedCheckOut) {
    issues.push("Add a valid check-out date.");
  } else if (parsedCheckIn && !nights) {
    issues.push("Check-out must be at least 1 night after check-in.");
  }

  return {
    isValid: issues.length === 0,
    issues,
    query: {
      adults,
      checkIn: parsedCheckIn?.iso ?? checkIn,
      checkOut: parsedCheckOut?.iso ?? checkOut,
      children,
      location,
      nights,
      roomType,
      rooms,
    },
  };
}

export function buildSearchParams(query: SearchQuery, roomType: RoomTypeOption) {
  const params = new URLSearchParams({
    adults: String(query.adults),
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    children: String(query.children),
    location: query.location,
    nights: String(query.nights),
    roomType,
    rooms: String(query.rooms),
  });

  return params.toString();
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parsePositiveInt(value: string, fallback: number, minimum: number) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, parsed);
}
