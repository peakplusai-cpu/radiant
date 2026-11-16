/**
 * Opens the NewebPay hosted page. The server signs the request; the browser only
 * relays it as a form post because NewebPay does not accept redirects with a body.
 * Returns an error message when it could not start, otherwise the page navigates away.
 */
export async function startPayment(code: string, token?: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("/api/pay/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, token }),
    });
  } catch {
    return "網路連線異常，請稍後再試";
  }
  const json = (await res.json().catch(() => ({}))) as { action?: string; fields?: Record<string, string>; error?: string };
  if (!res.ok || !json.action || !json.fields) return json.error ?? "無法開啟付款頁面，請稍後再試";

  const form = document.createElement("form");
  form.method = "POST";
  form.action = json.action;
  form.acceptCharset = "UTF-8";
  for (const [name, value] of Object.entries(json.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
  return null;
}
