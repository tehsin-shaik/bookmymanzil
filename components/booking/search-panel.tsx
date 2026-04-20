"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculateNightsBetweenDates,
  formatDateAsIso,
} from "@/lib/search/date-utils";
import { ROOM_TYPE_OPTIONS, type RoomTypeOption } from "@/lib/search/search-query";

const LOCATION_OPTIONS = [
  "UAE",
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Ras Al Khaimah",
  "Fujairah",
  "Umm Al Quwain",
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type OpenPopover = "dates" | "guests" | null;
type DateStep = "checkIn" | "checkOut";
type SearchErrors = Partial<Record<"location" | "checkIn" | "checkOut" | "roomType", string>>;

const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});

export function SearchPanel() {
  const router = useRouter();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [location, setLocation] = useState("");
  const [roomType, setRoomType] = useState<RoomTypeOption>("All");
  const [checkIn, setCheckIn] = useState<Date | null>(null);
  const [checkOut, setCheckOut] = useState<Date | null>(null);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  const [dateStep, setDateStep] = useState<DateStep>("checkIn");
  const [visibleMonth, setVisibleMonth] = useState(startOfMonth(today));
  const [errors, setErrors] = useState<SearchErrors>({});
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openPopover) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openPopover]);

  const nights = useMemo(() => calculateNightsBetweenDates(checkIn, checkOut), [checkIn, checkOut]);
  const guestSummary = useMemo(
    () => formatGuestSummary({ adults, children, rooms }),
    [adults, children, rooms]
  );
  const canViewPreviousMonth = isAfterMonth(visibleMonth, startOfMonth(today));

  function openDates(target: DateStep) {
    setDateStep(target === "checkOut" && checkIn ? "checkOut" : "checkIn");
    setVisibleMonth(startOfMonth(target === "checkOut" && checkIn ? checkIn : checkIn ?? today));
    setOpenPopover("dates");
  }

  function handleDateSelect(date: Date) {
    const normalizedDate = startOfDay(date);

    setErrors((current) => ({
      ...current,
      checkIn: undefined,
      checkOut: undefined,
    }));

    if (dateStep === "checkIn") {
      setCheckIn(normalizedDate);

      if (checkOut && isAfterDay(checkOut, normalizedDate)) {
        setOpenPopover(null);
        return;
      }

      setCheckOut(null);
      setDateStep("checkOut");
      return;
    }

    if (!checkIn) {
      setCheckIn(normalizedDate);
      setDateStep("checkOut");
      return;
    }

    if (!isAfterDay(normalizedDate, checkIn)) {
      return;
    }

    setCheckOut(normalizedDate);
    setOpenPopover(null);
  }

  function validateSearch() {
    const nextErrors: SearchErrors = {};

    if (!location) {
      nextErrors.location = "Choose where you'd like to stay.";
    }

    if (!checkIn) {
      nextErrors.checkIn = "Select your check-in date.";
    } else if (isBeforeDay(checkIn, today)) {
      nextErrors.checkIn = "Check-in can't be in the past.";
    }

    if (!checkOut) {
      nextErrors.checkOut = "Select your check-out date.";
    } else if (!nights) {
      nextErrors.checkOut = "Choose a stay of at least 1 night.";
    }

    if (!roomType) {
      nextErrors.roomType = "Select a room category.";
    }

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  }

  function handleSearch() {
    if (!validateSearch() || !checkIn || !checkOut) {
      return;
    }

    const params = new URLSearchParams({
      location,
      checkIn: formatDateAsIso(checkIn),
      checkOut: formatDateAsIso(checkOut),
      adults: String(adults),
      children: String(children),
      rooms: String(rooms),
      roomType,
    });

    router.push(`/search?${params.toString()}`);
  }

  // This is the premium search card shown under the hero.
  return (
    <section ref={panelRef} id="booking" className="relative">
      <div className="overflow-hidden rounded-[34px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(249,242,233,0.98))] p-4 shadow-[0_24px_80px_rgba(73,51,29,0.16)] backdrop-blur sm:p-6 lg:p-7">
        <div className="flex flex-col gap-4 border-b border-stone-200/80 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
              Refined Search
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
              Curate your next stay
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Choose your destination, travel dates, and room style for a tailored booking experience.
            </p>
          </div>

          <div className="inline-flex rounded-full border border-stone-200 bg-white/90 p-1 shadow-sm">
            {ROOM_TYPE_OPTIONS.map((option) => {
              const isActive = roomType === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setRoomType(option);
                    setErrors((current) => ({ ...current, roomType: undefined }));
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition sm:px-5 ${
                    isActive
                      ? "bg-stone-900 text-white shadow-[0_10px_24px_rgba(28,25,23,0.18)]"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr_1.2fr_auto]">
          <div className="space-y-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Location
              </span>
              <div
                className={`relative overflow-hidden rounded-[26px] border bg-white/95 shadow-[0_10px_30px_rgba(120,93,64,0.08)] transition focus-within:border-stone-400 focus-within:ring-4 focus-within:ring-stone-200/60 ${
                  errors.location ? "border-rose-300 ring-4 ring-rose-100" : "border-stone-200/80"
                }`}
              >
                <select
                  value={location}
                  onChange={(event) => {
                    setLocation(event.target.value);
                    setErrors((current) => ({ ...current, location: undefined }));
                  }}
                  className="h-[74px] w-full appearance-none bg-transparent px-5 pr-12 text-left text-sm font-medium text-stone-900 outline-none"
                >
                  <option value="">Select destination</option>
                  {LOCATION_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === "UAE" ? "UAE - All destinations" : option}
                    </option>
                  ))}
                </select>
                <Chevron className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
              </div>
            </label>
            {errors.location ? <FieldError message={errors.location} /> : null}
          </div>

          <div className="space-y-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Check in
            </span>
            <button
              type="button"
              onClick={() => openDates("checkIn")}
              className={`group flex h-[74px] w-full flex-col justify-center rounded-[26px] border bg-white/95 px-5 text-left shadow-[0_10px_30px_rgba(120,93,64,0.08)] transition hover:border-stone-300 ${
                errors.checkIn ? "border-rose-300 ring-4 ring-rose-100" : "border-stone-200/80"
              }`}
            >
              <span className="text-sm font-semibold text-stone-900">
                {checkIn ? longDateFormatter.format(checkIn) : "Add arrival date"}
              </span>
              <span className="mt-1 text-xs text-stone-500">
                {checkIn ? "Arrival" : "Past dates are unavailable"}
              </span>
            </button>
            {errors.checkIn ? <FieldError message={errors.checkIn} /> : null}
          </div>

          <div className="space-y-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Check out
            </span>
            <button
              type="button"
              onClick={() => openDates("checkOut")}
              className={`group flex h-[74px] w-full flex-col justify-center rounded-[26px] border bg-white/95 px-5 text-left shadow-[0_10px_30px_rgba(120,93,64,0.08)] transition hover:border-stone-300 ${
                errors.checkOut ? "border-rose-300 ring-4 ring-rose-100" : "border-stone-200/80"
              }`}
            >
              <span className="text-sm font-semibold text-stone-900">
                {checkOut ? longDateFormatter.format(checkOut) : "Add departure date"}
              </span>
              <span className="mt-1 text-xs text-stone-500">
                {checkOut
                  ? `${nights} ${nights === 1 ? "night" : "nights"}`
                  : checkIn
                    ? "Minimum stay is 1 night"
                    : "Select check-in first"}
              </span>
            </button>
            {errors.checkOut ? <FieldError message={errors.checkOut} /> : null}
          </div>

          <div className="space-y-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Rooms & Guests
            </span>
            <button
              type="button"
              onClick={() => setOpenPopover((current) => (current === "guests" ? null : "guests"))}
              className="flex h-[74px] w-full flex-col justify-center rounded-[26px] border border-stone-200/80 bg-white/95 px-5 text-left shadow-[0_10px_30px_rgba(120,93,64,0.08)] transition hover:border-stone-300"
            >
              <span className="text-sm font-semibold text-stone-900">{guestSummary}</span>
              <span className="mt-1 text-xs text-stone-500">Adjust your party size</span>
            </button>
          </div>

          <div className="space-y-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-transparent">
              Search
            </span>
            <button
              type="button"
              onClick={handleSearch}
              className="flex h-[74px] w-full items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#9a6b2f,#c38a42_42%,#7b5425)] px-7 text-sm font-semibold tracking-[0.08em] text-white shadow-[0_16px_36px_rgba(135,86,31,0.28)] transition hover:brightness-110"
            >
              Search Stays
            </button>
          </div>
        </div>

        {errors.roomType ? <FieldError className="mt-3" message={errors.roomType} /> : null}

        {/* This is the date range picker used for check-in and check-out. */}
        {openPopover === "dates" ? (
          <div className="mt-5 rounded-[30px] border border-stone-200/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(120,93,64,0.12)] sm:p-5">
            <div className="flex flex-col gap-4 border-b border-stone-200/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDateStep("checkIn")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    dateStep === "checkIn" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  Check in
                </button>
                <button
                  type="button"
                  onClick={() => setDateStep(checkIn ? "checkOut" : "checkIn")}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    dateStep === "checkOut" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  Check out
                </button>
              </div>

              <div className="text-sm text-stone-600">
                {checkIn && checkOut
                  ? `${longDateFormatter.format(checkIn)} to ${longDateFormatter.format(checkOut)} · ${nights} ${
                      nights === 1 ? "night" : "nights"
                    }`
                  : "Choose your dates to see the length of stay"}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
                disabled={!canViewPreviousMonth}
                className="rounded-full border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                className="rounded-full border border-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
              >
                Next
              </button>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {[visibleMonth, addMonths(visibleMonth, 1)].map((month) => (
                <CalendarMonth
                  key={toLocalDateKey(month)}
                  month={month}
                  today={today}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  dateStep={dateStep}
                  onSelectDate={handleDateSelect}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* This is the guests and rooms picker popover. */}
        {openPopover === "guests" ? (
          <div className="mt-5 rounded-[30px] border border-stone-200/80 bg-white/90 p-4 shadow-[0_18px_40px_rgba(120,93,64,0.12)] sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-stone-900">Customize your stay</p>
                <p className="mt-1 text-sm text-stone-600">
                  Fine-tune the number of rooms and guests before exploring availability.
                </p>
              </div>

              <div className="min-w-[260px] space-y-4">
                <CounterRow
                  label="Adults"
                  description="Ages 13 and above"
                  value={adults}
                  minValue={1}
                  onChange={setAdults}
                />
                <CounterRow
                  label="Children"
                  description="Ages 0 to 12"
                  value={children}
                  minValue={0}
                  onChange={setChildren}
                />
                <CounterRow
                  label="Rooms"
                  description="Suites or connected rooms"
                  value={rooms}
                  minValue={1}
                  onChange={setRooms}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function CalendarMonth({
  month,
  today,
  checkIn,
  checkOut,
  dateStep,
  onSelectDate,
}: {
  month: Date;
  today: Date;
  checkIn: Date | null;
  checkOut: Date | null;
  dateStep: DateStep;
  onSelectDate: (date: Date) => void;
}) {
  const days = buildCalendarDays(month);

  return (
    <div className="rounded-[28px] border border-stone-200/70 bg-stone-50/70 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-stone-900">{monthFormatter.format(month)}</h3>
        <p className="text-xs uppercase tracking-[0.16em] text-stone-400">
          {dateStep === "checkIn" ? "Select arrival" : "Select departure"}
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-2">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) {
            return <div key={`${month.toISOString()}-blank-${index}`} className="h-11 rounded-2xl" />;
          }

          const isDisabled =
            isBeforeDay(day, today) || (dateStep === "checkOut" && !!checkIn && !isAfterDay(day, checkIn));
          const isSelectedCheckIn = !!checkIn && isSameDay(day, checkIn);
          const isSelectedCheckOut = !!checkOut && isSameDay(day, checkOut);
          const isInRange = !!checkIn && !!checkOut && isAfterDay(day, checkIn) && isBeforeDay(day, checkOut);

          return (
              <div
              key={toLocalDateKey(day)}
              className={`flex h-11 items-center justify-center rounded-2xl ${
                isInRange ? "bg-amber-100/80" : ""
              }`}
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => onSelectDate(day)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm transition ${
                  isSelectedCheckIn || isSelectedCheckOut
                    ? "bg-stone-900 font-semibold text-white shadow-md"
                    : isDisabled
                      ? "cursor-not-allowed text-stone-300"
                      : "text-stone-700 hover:bg-stone-200/80"
                }`}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CounterRow({
  label,
  description,
  value,
  minValue,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  minValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/70 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        <p className="text-xs text-stone-500">{description}</p>
      </div>

      <div className="flex items-center gap-2">
        <CounterButton
          label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= minValue}
          onClick={() => onChange(Math.max(minValue, value - 1))}
        >
          -
        </CounterButton>
        <span className="w-8 text-center text-sm font-semibold text-stone-900">{value}</span>
        <CounterButton label={`Increase ${label.toLowerCase()}`} onClick={() => onChange(value + 1)}>
          +
        </CounterButton>
      </div>
    </div>
  );
}

function CounterButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stone-200 bg-white text-lg text-stone-700 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function FieldError({ message, className = "" }: { message: string; className?: string }) {
  return <p className={`text-sm text-rose-700 ${className}`}>{message}</p>;
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M5 7.5 10 12.5l5-5" />
    </svg>
  );
}

function buildCalendarDays(month: Date) {
  const firstDayOfMonth = startOfMonth(month);
  const lastDayOfMonth = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth() + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const leadingEmptyDays = firstDayOfMonth.getDay();
  const trailingEmptyDays = (7 - ((leadingEmptyDays + daysInMonth) % 7)) % 7;
  const days: Array<Date | null> = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth(), day));
  }

  for (let index = 0; index < trailingEmptyDays; index += 1) {
    days.push(null);
  }

  return days;
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function startOfMonth(date: Date) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfDay(nextDate);
}

function addMonths(date: Date, count: number) {
  return startOfMonth(new Date(date.getFullYear(), date.getMonth() + count, 1));
}

function isSameDay(left: Date, right: Date) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function isBeforeDay(left: Date, right: Date) {
  return startOfDay(left).getTime() < startOfDay(right).getTime();
}

function isAfterDay(left: Date, right: Date) {
  return startOfDay(left).getTime() > startOfDay(right).getTime();
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatGuestSummary({
  adults,
  children,
  rooms,
}: {
  adults: number;
  children: number;
  rooms: number;
}) {
  const parts = [`${adults} Adult${adults === 1 ? "" : "s"}`];

  if (children > 0) {
    parts.push(`${children} Child${children === 1 ? "" : "ren"}`);
  }

  parts.push(`${rooms} Room${rooms === 1 ? "" : "s"}`);

  return parts.join(" · ");
}

function isAfterMonth(left: Date, right: Date) {
  return left.getFullYear() > right.getFullYear() || (left.getFullYear() === right.getFullYear() && left.getMonth() > right.getMonth());
}
