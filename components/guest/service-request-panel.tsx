import { Cormorant_Garamond } from "next/font/google";
import { type GuestStayServiceRequestState } from "@/lib/service-requests";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export function ServiceRequestPanel({
  actionError,
  serviceState,
  submitGuestServiceRequest,
  success,
}: {
  actionError: string;
  serviceState: GuestStayServiceRequestState;
  submitGuestServiceRequest: (formData: FormData) => void | Promise<void>;
  success: string;
}) {
  const minimumPreferredTime = getCurrentDateTimeLocalValue();

  return (
    <section className="mt-8 rounded-[28px] border border-stone-200/80 bg-white/90 p-6 shadow-[0_12px_32px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">During Your Stay</p>
      <h2 className={`${cormorant.className} mt-3 text-3xl tracking-[-0.03em] text-stone-900`}>
        Service Requests
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
        Request housekeeping, room service, or maintenance support for this stay and track the latest status here.
      </p>

      {success ? (
        <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-7 text-emerald-800">
          Your service request has been submitted successfully.
        </div>
      ) : null}

      {actionError ? (
        <div className="mt-6 rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm leading-7 text-rose-700">
          {actionError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">New Request</p>
          {serviceState.canSubmit ? (
            <form action={submitGuestServiceRequest} className="mt-4 space-y-4">
              <input type="hidden" name="reservationCode" value={serviceState.reservationCode} />

              <label className="block">
                <span className="text-sm font-semibold text-stone-900">Category</span>
                <select
                  name="categoryId"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    Choose a service category
                  </option>
                  {serviceState.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-stone-900">Description</span>
                <textarea
                  name="description"
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-500"
                  placeholder="Tell the hotel team what you need."
                  required
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-stone-900">Preferred Time</span>
                <input
                  type="datetime-local"
                  name="preferredTime"
                  min={minimumPreferredTime}
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
                />
              </label>

              <button className="inline-flex h-12 items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white transition hover:bg-stone-800">
                Submit Request
              </button>
            </form>
          ) : (
            <div className="mt-4 rounded-[20px] border border-stone-200 bg-white px-4 py-4 text-sm leading-7 text-stone-600">
              {serviceState.disabledReason || "Service requests are not available for this stay yet."}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-stone-200/80 bg-stone-50/80 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Request History</p>
          {serviceState.requests.length === 0 ? (
            <div className="mt-4 rounded-[20px] border border-dashed border-stone-300 bg-white px-4 py-5 text-sm leading-7 text-stone-600">
              No service requests have been submitted for this stay yet.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {serviceState.requests.map((request) => (
                <article key={request.id} className="rounded-[20px] border border-stone-200 bg-white px-4 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{request.categoryName}</p>
                      <p className="mt-2 text-sm leading-7 text-stone-600">{request.description}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <InfoItem label="Room" value={request.roomNumber} />
                    <InfoItem label="Priority" value={formatStatus(request.priority)} />
                    <InfoItem label="Requested" value={formatTimestamp(request.createdAt)} />
                    <InfoItem
                      label="Preferred Time"
                      value={request.preferredTime ? formatTimestamp(request.preferredTime) : "No preference"}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
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

function getCurrentDateTimeLocalValue() {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  const day = String(current.getDate()).padStart(2, "0");
  const hours = String(current.getHours()).padStart(2, "0");
  const minutes = String(current.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
