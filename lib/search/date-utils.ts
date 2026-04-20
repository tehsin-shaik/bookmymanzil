const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

export function formatDateAsIso(date: Date) {
  const normalizedDate = startOfDay(date);

  return `${normalizedDate.getFullYear()}-${String(normalizedDate.getMonth() + 1).padStart(2, "0")}-${String(
    normalizedDate.getDate()
  ).padStart(2, "0")}`;
}

export function parseIsoDateString(value: string) {
  const trimmedValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return null;
  }

  const [yearString, monthString, dayString] = trimmedValue.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsedDate = startOfDay(new Date(year, month - 1, day));

  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return null;
  }

  return {
    date: parsedDate,
    iso: formatDateAsIso(parsedDate),
  };
}

export function calculateNightsBetweenDates(checkIn: Date | null, checkOut: Date | null) {
  if (!checkIn || !checkOut) {
    return 0;
  }

  const normalizedCheckIn = startOfDay(checkIn);
  const normalizedCheckOut = startOfDay(checkOut);
  const difference = normalizedCheckOut.getTime() - normalizedCheckIn.getTime();

  return difference > 0 ? Math.round(difference / DAY_MS) : 0;
}

export function isDateInPast(date: Date, referenceDate = new Date()) {
  return startOfDay(date).getTime() < startOfDay(referenceDate).getTime();
}
