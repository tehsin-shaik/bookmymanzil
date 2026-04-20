begin;

-- This function is the final booking safety boundary.
-- It validates capacity, locks candidate rooms, excludes overlapping reservations/blocks,
-- and writes the grouped booking + child reservation rows in one atomic operation.
create or replace function public.create_guest_reservation_atomic(
  p_user_id uuid,
  p_hotel_id bigint,
  p_room_type_id bigint,
  p_check_in_date date,
  p_check_out_date date,
  p_adults integer,
  p_children integer,
  p_selected_rooms integer,
  p_nights integer,
  p_price_per_night numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_room_ids bigint[];
  v_guest_profile_id bigint;
  v_inserted_reservation_ids bigint[];
  v_actual_available_room_count integer;
  v_booking_total_price numeric(12,2);
  v_max_capacity integer;
  v_max_guests_for_selection integer;
  v_per_room_total_price numeric(12,2);
  v_reservation_code text;
  v_reservation_group_id bigint;
  v_room_type_max_capacity integer;
  v_total_guests integer;
begin
  if p_user_id is null then
    raise exception 'Guest user id is required for atomic reservation creation.';
  end if;

  if p_hotel_id is null or p_room_type_id is null then
    raise exception 'Hotel id and room type id are required for atomic reservation creation.';
  end if;

  if p_check_in_date is null or p_check_out_date is null or p_check_out_date <= p_check_in_date then
    raise exception 'A valid check-in and check-out date range is required.';
  end if;

  if p_selected_rooms is null or p_selected_rooms < 1 then
    raise exception 'At least one room must be requested.';
  end if;

  if p_nights is null or p_nights < 1 then
    raise exception 'At least one night must be requested.';
  end if;

  if p_adults is null or p_adults < 1 then
    raise exception 'At least one adult guest is required.';
  end if;

  if p_children is null or p_children < 0 then
    raise exception 'Children count cannot be negative.';
  end if;

  if p_price_per_night is null or p_price_per_night < 0 then
    raise exception 'A valid server-side price per night is required.';
  end if;

  select gp.id
  into v_guest_profile_id
  from public.guest_profiles gp
  where gp.user_id = p_user_id;

  if v_guest_profile_id is null then
    return jsonb_build_object(
      'actual_available_room_count', 0,
      'bookable', false,
      'reason', 'We could not verify your guest profile for this booking. Please log in again or contact support.',
      'max_guests_for_selection', null,
      'requested_room_count', p_selected_rooms,
      'reservation_code', null,
      'reservation_group_id', null,
      'reservation_ids', '[]'::jsonb,
      'total_guests', p_adults + p_children
    );
  end if;

  select rt.max_capacity
  into v_room_type_max_capacity
  from public.room_types rt
  where rt.id = p_room_type_id;

  -- This function intentionally relies on the stable canonical capacity source in the live schema.
  -- Keep the final booking guard tied to room_types.max_capacity unless the DB schema is explicitly expanded.
  v_max_capacity := coalesce(v_room_type_max_capacity, 0);

  if v_max_capacity is null or v_max_capacity < 1 then
    return jsonb_build_object(
      'actual_available_room_count', 0,
      'bookable', false,
      'reason', 'We could not verify the occupancy limit for this room type. Please contact support or try a different room option.',
      'max_guests_for_selection', null,
      'requested_room_count', p_selected_rooms,
      'reservation_code', null,
      'reservation_group_id', null,
      'reservation_ids', '[]'::jsonb,
      'total_guests', p_adults + p_children
    );
  end if;

  v_total_guests := p_adults + p_children;
  v_max_guests_for_selection := v_max_capacity * p_selected_rooms;

  raise log '[create_guest_reservation_atomic] hotel_id=%, room_type_id=%, room_type_max_capacity=%, effective_max_capacity=%, total_guests=%, selected_rooms=%, max_guests_for_selection=%',
    p_hotel_id,
    p_room_type_id,
    v_room_type_max_capacity,
    v_max_capacity,
    v_total_guests,
    p_selected_rooms,
    v_max_guests_for_selection;

  if v_total_guests > v_max_guests_for_selection then
    return jsonb_build_object(
      'actual_available_room_count', 0,
      'bookable', false,
      'reason', 'Too many guests for this room selection. Choose more rooms or a larger room type.',
      'max_guests_for_selection', v_max_guests_for_selection,
      'requested_room_count', p_selected_rooms,
      'reservation_code', null,
      'reservation_group_id', null,
      'reservation_ids', '[]'::jsonb,
      'total_guests', v_total_guests
    );
  end if;

  -- This is the core double-booking guard:
  -- only currently available, non-blocked, non-overlapping rooms can be locked and selected.
  with locked_rooms as (
    select r.id
    from public.rooms r
    where r.hotel_id = p_hotel_id
      and r.room_type_id = p_room_type_id
      and lower(coalesce(r.status, 'available')) not in (
        'booked',
        'occupied',
        'maintenance',
        'inactive',
        'out_of_service',
        'blocked'
      )
      and not exists (
        select 1
        from public.room_blocks rb
        where rb.room_id = r.id
          and lower(coalesce(rb.status, 'active')) not in (
            'cancelled',
            'canceled',
            'released',
            'inactive',
            'completed'
          )
          and rb.start_datetime < p_check_out_date::timestamp
          and rb.end_datetime > p_check_in_date::timestamp
      )
      and not exists (
        select 1
        from public.reservations existing_reservation
        where existing_reservation.room_id = r.id
          and lower(coalesce(existing_reservation.reservation_status, 'confirmed')) not in (
            'cancelled',
            'canceled',
            'checked_out',
            'completed',
            'released',
            'no_show'
          )
          and existing_reservation.check_in_date < p_check_out_date
          and existing_reservation.check_out_date > p_check_in_date
      )
    order by r.id
    for update skip locked
    limit p_selected_rooms
  )
  select
    coalesce(array_agg(id order by id), '{}'::bigint[]),
    count(*)
  into
    v_candidate_room_ids,
    v_actual_available_room_count
  from locked_rooms;

  if v_actual_available_room_count < p_selected_rooms then
    return jsonb_build_object(
      'actual_available_room_count', v_actual_available_room_count,
      'bookable', false,
      'reason', format(
        'Only %s %s available for your selected dates.',
        v_actual_available_room_count,
        case when v_actual_available_room_count = 1 then 'room is' else 'rooms are' end
      ),
      'max_guests_for_selection', v_max_guests_for_selection,
      'requested_room_count', p_selected_rooms,
      'reservation_code', null,
      'reservation_group_id', null,
      'reservation_ids', '[]'::jsonb,
      'total_guests', v_total_guests
    );
  end if;

  v_reservation_code :=
    'BMM-' ||
    to_char(current_date, 'YYYYMMDD') ||
    '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_per_room_total_price := round((p_price_per_night * p_nights)::numeric, 2);
  v_booking_total_price := round((v_per_room_total_price * p_selected_rooms)::numeric, 2);

  insert into public.reservation_groups (
    reservation_code,
    user_id,
    hotel_id,
    check_in_date,
    check_out_date,
    nights,
    adults,
    children,
    selected_rooms,
    price_per_night,
    total_price,
    booking_status
  )
  values (
    v_reservation_code,
    p_user_id,
    p_hotel_id,
    p_check_in_date,
    p_check_out_date,
    p_nights,
    p_adults,
    p_children,
    p_selected_rooms,
    p_price_per_night,
    v_booking_total_price,
    'confirmed'
  )
  returning id into v_reservation_group_id;

  -- One child reservation row is written per locked room, all sharing the same booking-level code.
  with inserted_reservations as (
    insert into public.reservations (
      reservation_group_id,
      reservation_code,
      user_id,
      created_by_user_id,
      guest_profile_id,
      hotel_id,
      room_id,
      room_type_id,
      check_in_date,
      check_out_date,
      nights,
      adults,
      children,
      guests_count,
      price_per_night,
      total_price,
      reservation_status
    )
    select
      v_reservation_group_id,
      v_reservation_code,
      p_user_id,
      p_user_id,
      v_guest_profile_id,
      p_hotel_id,
      room_id,
      p_room_type_id,
      p_check_in_date,
      p_check_out_date,
      p_nights,
      p_adults,
      p_children,
      v_total_guests,
      p_price_per_night,
      v_per_room_total_price,
      'confirmed'
    from unnest(v_candidate_room_ids) as room_id
    returning id
  )
  select coalesce(array_agg(id order by id), '{}'::bigint[])
  into v_inserted_reservation_ids
  from inserted_reservations;

  return jsonb_build_object(
    'actual_available_room_count', v_actual_available_room_count,
    'bookable', true,
    'max_guests_for_selection', v_max_guests_for_selection,
    'reason', null,
    'requested_room_count', p_selected_rooms,
    'reservation_code', v_reservation_code,
    'reservation_group_id', v_reservation_group_id,
    'reservation_ids', to_jsonb(v_inserted_reservation_ids),
    'total_guests', v_total_guests
  );
end;
$$;

revoke all on function public.create_guest_reservation_atomic(
  uuid,
  bigint,
  bigint,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  numeric
) from public;

grant execute on function public.create_guest_reservation_atomic(
  uuid,
  bigint,
  bigint,
  date,
  date,
  integer,
  integer,
  integer,
  integer,
  numeric
) to authenticated, service_role;

commit;
