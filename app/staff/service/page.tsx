import Link from "next/link";
import { StaffShell } from "@/components/staff/staff-shell";
import { getAllowedStaffStatusTransitions, getStaffServiceWorklist } from "@/lib/service-requests";
import { updateStaffServiceRequestStatus } from "@/app/staff/service/actions";

type StaffServicePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffServicePage({ searchParams }: StaffServicePageProps) {
  const params = await searchParams;
  const statusFilter = readParam(params.status);
  const categoryFilter = readParam(params.category);
  const success = readParam(params.success);
  const error = readParam(params.error);
  const { data, error: scopeError } = await getStaffServiceWorklist({
    category: categoryFilter,
    status: statusFilter,
  });

  return (
    <StaffShell
      description="Review incoming guest service requests, keep work moving, and update request statuses so guests see the latest progress from their stay page."
      session={data.staffSession}
      title="Service worklist"
    >
      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <form method="get" action="/staff/service" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <select
            name="status"
            defaultValue={statusFilter}
            className="h-12 rounded-full border border-stone-300 bg-white px-5 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            name="category"
            defaultValue={categoryFilter}
            className="h-12 rounded-full border border-stone-300 bg-white px-5 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          >
            <option value="">All categories</option>
            {data.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <button className="inline-flex h-12 items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition hover:bg-stone-800">
            Filter requests
          </button>

          <Link
            href="/staff/service"
            className="inline-flex h-12 items-center justify-center rounded-full border border-stone-300 bg-white px-6 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          >
            Reset
          </Link>
        </form>
      </section>

      {success ? (
        <section className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
          The service request status has been updated.
        </section>
      ) : null}

      {error ? (
        <section className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
          {error}
        </section>
      ) : null}

      {scopeError ? (
        <section className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
          {scopeError}
        </section>
      ) : null}

      <section className="rounded-[30px] border border-white/75 bg-[rgba(255,252,247,0.88)] p-6 shadow-[0_18px_48px_rgba(96,72,47,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">Service Requests</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">Active hotel support queue</h2>
          </div>
          <p className="text-sm text-stone-600">{data.requests.length} requests</p>
        </div>

        {data.requests.length === 0 ? (
          <div className="mt-8 rounded-[24px] border border-stone-200/80 bg-white/90 p-5 text-sm leading-7 text-stone-600">
            No service requests match the current filters.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {data.requests.map((request) => (
              <article
                key={request.id}
                className="rounded-[24px] border border-stone-200/80 bg-white/92 p-5 shadow-[0_12px_32px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="max-w-3xl">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                      Request #{request.id} • {request.categoryName}
                    </p>
                    <h3 className="mt-3 text-xl font-semibold tracking-tight text-stone-900">{request.guestName}</h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600">{request.description}</p>
                  </div>
                  <StatusBadge status={request.status} />
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoCard label="Reservation" value={request.reservationCode} />
                  <InfoCard label="Hotel" value={request.hotelCity ? `${request.hotelName} • ${request.hotelCity}` : request.hotelName} />
                  <InfoCard label="Room" value={`${request.roomTypeName} • ${request.roomNumber}`} />
                  <InfoCard label="Priority" value={formatStatus(request.priority)} />
                  <InfoCard label="Guest Phone" value={request.guestPhoneNumber || "Not available"} />
                  <InfoCard
                    label="Preferred Time"
                    value={request.preferredTime ? formatTimestamp(request.preferredTime) : "No preference"}
                  />
                  <InfoCard label="Submitted" value={formatTimestamp(request.createdAt)} />
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {getAllowedStaffStatusTransitions(request.status).length === 0 ? (
                    <span className="inline-flex items-center rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-600">
                      No further action
                    </span>
                  ) : (
                    getAllowedStaffStatusTransitions(request.status).map((targetStatus) => (
                      <form key={targetStatus} action={updateStaffServiceRequestStatus}>
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="targetStatus" value={targetStatus} />
                        <button className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800">
                          Mark {formatStatus(targetStatus)}
                        </button>
                      </form>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </StaffShell>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "in_progress"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : status === "cancelled"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-stone-200 bg-stone-50 text-stone-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {formatStatus(status)}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-stone-200/80 bg-stone-50/80 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-900">{value}</p>
    </div>
  );
}
