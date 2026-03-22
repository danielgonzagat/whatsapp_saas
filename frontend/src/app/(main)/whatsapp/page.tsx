import { redirect } from "next/navigation";

export default async function WhatsAppConnectionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const qp = new URLSearchParams();
  qp.set("panel", "whatsapp");

  const from =
    typeof resolvedSearchParams?.from === "string"
      ? resolvedSearchParams.from
      : "";
  if (from) qp.set("from", from);

  const autoConnect =
    typeof resolvedSearchParams?.autoConnect === "string"
      ? resolvedSearchParams.autoConnect
      : "";
  if (autoConnect) qp.set("autoConnect", autoConnect);

  redirect(`/?${qp.toString()}`);
}
