// Shared Microsoft 365 / Graph helpers — used by ms-oauth-callback, ms-check,
// ms-send and ms-personal. Mirrors the Gmail integration's token handling.
//
// Required Supabase secrets: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID.
//   - MS_TENANT_ID = your Entra ID directory (tenant) id for a single-org app
//     (falls back to "common" for multi-tenant).

export const MS_GRAPH = "https://graph.microsoft.com/v1.0";

// Delegated scopes: read/write + send mail for the connected mailbox, plus a
// refresh token (offline_access) and the signed-in user's basic profile.
export const MS_SCOPES = "offline_access openid email profile User.Read Mail.ReadWrite Mail.Send";

export function msTenant(): string {
  return Deno.env.get("MS_TENANT_ID") || "common";
}

export function msAuthority(): string {
  return `https://login.microsoftonline.com/${msTenant()}`;
}

/** OAuth: exchange an authorization code for tokens (the connect flow). */
export async function msTokenFromCode(code: string, redirectUri: string) {
  const res = await fetch(`${msAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: MS_SCOPES,
    }),
  });
  return await res.json();
}

/** Exchange a stored refresh token for a fresh access token. */
export async function msTokenFromRefresh(refreshToken: string) {
  const res = await fetch(`${msAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: MS_SCOPES,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("MS token refresh failed: " + JSON.stringify(data));
  return data as { access_token: string; expires_in: number; refresh_token?: string };
}

/** Authenticated Microsoft Graph call. Returns parsed JSON (or null for 204). */
export async function graph(accessToken: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${MS_GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new Error(`Graph ${init.method || "GET"} ${path} -> ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

/** The signed-in mailbox address (userPrincipalName / mail). */
export async function graphMe(accessToken: string): Promise<string> {
  const me = await graph(accessToken, "/me?$select=mail,userPrincipalName") as { mail?: string; userPrincipalName?: string };
  return (me?.mail || me?.userPrincipalName || "").toLowerCase();
}
