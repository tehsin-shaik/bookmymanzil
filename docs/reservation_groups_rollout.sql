begin;

create table if not exists public.reservation_groups (
  id bigint generated always as identity primary key,
  reservation_code text not null unique,
  user_id uuid not null,
  hotel_id bigint not null,
  check_in_date date not null,
  check_out_date date not null,
  nights integer not null,
  adults integer not null,
  children integer not null default 0,
  selected_rooms integer not null,
  price_per_night numeric(12,2) not null,
  total_price numeric(12,2) not null,
  booking_status text not null default 'confirmed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reservation_groups_booking_status_check
    check (booking_status in ('confirmed', 'partially_cancelled', 'cancelled')),
  constraint reservation_groups_date_range_check
    check (check_out_date > check_in_date),
  constraint reservation_groups_nights_check
    check (nights > 0),
  constraint reservation_groups_adults_check
    check (adults >= 1),
  constraint reservation_groups_children_check
    check (children >= 0),
  constraint reservation_groups_selected_rooms_check
    check (selected_rooms >= 1),
  constraint reservation_groups_price_per_night_check
    check (price_per_night >= 0),
  constraint reservation_groups_total_price_check
    check (total_price >= 0),
  constraint reservation_groups_user_id_fkey
    foreign key (user_id) references public.users(id),
  constraint reservation_groups_hotel_id_fkey
    foreign key (hotel_id) references public.hotels(id)
);

alter table public.reservations
  add column if not exists reservation_group_id bigint;

alter table public.reservations
  drop constraint if exists reservations_reservation_group_id_fkey;

alter table public.reservations
  add constraint reservations_reservation_group_id_fkey
  foreign key (reservation_group_id)
  references public.reservation_groups(id);

create index if not exists reservation_groups_user_id_idx
  on public.reservation_groups (user_id);

create index if not exists reservation_groups_hotel_id_idx
  on public.reservation_groups (hotel_id);

create index if not exists reservation_groups_dates_idx
  on public.reservation_groups (check_in_date, check_out_date);

create index if not exists reservations_reservation_group_id_idx
  on public.reservations (reservation_group_id);

commit;

-- Optional backfill for legacy reservations created before reservation_groups existed.
-- Run this only if public.reservations already contains confirmed bookings without reservation_group_id values.
--
-- insert into public.reservation_groups (
--   reservation_code,
--   user_id,
--   hotel_id,
--   check_in_date,
--   check_out_date,
--   nights,
--   adults,
--   children,
--   selected_rooms,
--   price_per_night,
--   total_price,
--   booking_status
-- )
-- select
--   reservation_code,
--   min(user_id) as user_id,
--   min(hotel_id) as hotel_id,
--   min(check_in_date) as check_in_date,
--   min(check_out_date) as check_out_date,
--   min(nights) as nights,
--   min(adults) as adults,
--   min(children) as children,
--   count(*) as selected_rooms,
--   min(price_per_night) as price_per_night,
--   sum(total_price) as total_price,
--   case
--     when bool_and(reservation_status = 'cancelled') then 'cancelled'
--     when bool_or(reservation_status = 'cancelled') then 'partially_cancelled'
--     else 'confirmed'
--   end as booking_status
-- from public.reservations
-- where reservation_group_id is null
-- group by reservation_code;
--
-- update public.reservations r
-- set reservation_group_id = g.id
-- from public.reservation_groups g
-- where r.reservation_group_id is null
--   and r.reservation_code = g.reservation_code;
--
-- After backfill and deployment are verified:
-- alter table public.reservations
--   alter column reservation_group_id set not null;
