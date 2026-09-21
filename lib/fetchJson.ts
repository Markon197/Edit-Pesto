// Shared client-side fetch helper. Reads the response as text first and
// only then tries to parse it as JSON — a plain res.json() throws a raw
// "unexpected character" error straight into the UI if the server ever
// returns something that isn't JSON (e.g. a platform timeout page when a
// slow request, like an AI scan, runs past its limit).
export async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  // no-store by default: every call here reads live shared data (events,
  // stats, this week's list), and a cached copy — browser or CDN — is
  // always a bug for this app, never a feature.
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      `Something went wrong (status ${res.status}). This can happen if a request runs too long — try again, and if it keeps happening, tell Claude.`;
    throw new Error(message);
  }
  return data ?? {};
}
