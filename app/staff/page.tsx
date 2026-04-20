import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/auth/staff-session";
import { getStaffHomePath } from "@/lib/auth/staff-roles";

export default async function StaffDashboardPage() {
  const session = await requireStaffSession();
  redirect(getStaffHomePath(session.role));
}
