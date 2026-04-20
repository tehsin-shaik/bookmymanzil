begin;

-- Grouped child reservation rows should share the booking-level reservation_code from reservation_groups.
-- Drop the old uniqueness rule that only allowed one reservations row per code.
alter table public.reservations
  drop constraint if exists reservations_reservation_code_key;

drop index if exists public.reservations_reservation_code_idx;

-- New reservations should use the canonical application status.
alter table public.reservations
  alter column reservation_status set default 'confirmed';

commit;
