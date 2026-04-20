import { redirect } from "next/navigation";

type GuestSignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function GuestSignupPage({ searchParams }: GuestSignupPageProps) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();
  nextParams.set("register", "1");

  const returnTo = readParam(params.returnTo);
  const error = readParam(params.error);

  if (returnTo) {
    nextParams.set("returnTo", returnTo);
  }

  if (error) {
    nextParams.set("error", error);
  }

  redirect(`/?${nextParams.toString()}`);
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
