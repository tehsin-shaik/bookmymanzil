function slugifyValue(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildHotelSlug({
  fallbackId,
  name,
  slug,
}: {
  fallbackId?: string | null;
  name: string;
  slug?: string | null;
}) {
  const explicitSlug = slugifyValue(slug ?? "");

  if (explicitSlug) {
    return explicitSlug;
  }

  const nameSlug = slugifyValue(name);

  if (nameSlug && fallbackId) {
    return `${nameSlug}-${fallbackId.slice(0, 8).toLowerCase()}`;
  }

  if (nameSlug) {
    return nameSlug;
  }

  const idSlug = slugifyValue(fallbackId ?? "");
  return idSlug || "hotel";
}
