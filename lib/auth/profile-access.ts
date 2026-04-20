import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type ReadableQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
      };
    };
  };
};

export async function loadAppUserRecord(
  userId: string,
  fallbackClient?: ReadableQueryClient
) {
  const client = resolveReadableClient(fallbackClient);
  return client.from("users").select("id, first_name, last_name, email, phone_number, role").eq("id", userId).maybeSingle();
}

export async function loadGuestProfileRecord(
  userId: string,
  fallbackClient?: ReadableQueryClient
) {
  const client = resolveReadableClient(fallbackClient);
  return client.from("guest_profiles").select("user_id").eq("user_id", userId).maybeSingle();
}

export async function loadStaffProfileRecord(
  userId: string,
  fallbackClient?: ReadableQueryClient
) {
  const client = resolveReadableClient(fallbackClient);
  return client.from("staff_profiles").select("hotel_id, job_title").eq("user_id", userId).maybeSingle();
}

function resolveReadableClient(fallbackClient?: ReadableQueryClient) {
  return (createAdminClient() as ReadableQueryClient | null) ?? fallbackClient ?? failMissingProfileClient();
}

function failMissingProfileClient(): never {
  throw new Error("A readable profile client is required to verify application account records.");
}
