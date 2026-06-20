// Shared Microsoft 365 / Graph helpers — used by ms-oauth-callback, ms-check,
// ms-send and ms-personal. Mirrors the Gmail integration's token handling.
//
// Required Supabase secrets: MS_CLIENT_ID, MS_TENANT_ID, and ONE client
// credential —
//   - certificate auth (preferred; this tenant blocks client secrets):
//     MS_CLIENT_CERT_PRIVATE_KEY = the cert's PKCS8 private key PEM, and
//     MS_CLIENT_CERT_THUMBPRINT  = the cert thumbprint (hex, exactly as Azure
//     shows it after you upload the public cert); OR
//   - MS_CLIENT_SECRET (legacy fallback, if the tenant allows secrets).
//   MS_TENANT_ID = your Entra directory (tenant) id (falls back to "common").

export const MS_GRAPH = "https://graph.microsoft.com/v1.0";

// Delegated scopes: read/write + send mail for the connected mailbox, plus a
// refresh token (offline_access) and the signed-in user's basic profile.
export const MS_SCOPES = "offline_access openid email profile User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite";

export function msTenant(): string {
  return Deno.env.get("MS_TENANT_ID") || "common";
}

export function msAuthority(): string {
  return `https://login.microsoftonline.com/${msTenant()}`;
}

// ── Client credential (certificate assertion, or legacy secret) ─────────────

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlStr = (s: string) => b64url(new TextEncoder().encode(s));

// Azure shows the cert thumbprint as hex; the JWT `x5t` header is the base64url
// of those raw SHA-1 bytes.
function thumbprintToX5t(thumb: string): string {
  const hex = (thumb || "").replace(/[^0-9a-fA-F]/g, "");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b64url(bytes);
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// A short-lived JWT signed with the app certificate's private key — proves the
// client's identity to Entra in place of a client secret.
async function buildClientAssertion(clientId: string, pkPem: string, thumb: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", x5t: thumbprintToX5t(thumb) };
  const payload = {
    aud: `${msAuthority()}/oauth2/v2.0/token`,
    iss: clientId, sub: clientId,
    jti: crypto.randomUUID(),
    nbf: now, exp: now + 600,
  };
  const signingInput = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(pkPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

/** Credential params for the token request: certificate assertion if configured
 * (this tenant blocks secrets), else the legacy client_secret. */
async function clientCredential(): Promise<Record<string, string>> {
  const clientId = Deno.env.get("MS_CLIENT_ID")!;
  const pkPem = Deno.env.get("MS_CLIENT_CERT_PRIVATE_KEY");
  const thumb = Deno.env.get("MS_CLIENT_CERT_THUMBPRINT");
  if (pkPem && thumb) {
    return {
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: await buildClientAssertion(clientId, pkPem, thumb),
    };
  }
  const secret = Deno.env.get("MS_CLIENT_SECRET");
  if (secret) return { client_secret: secret };
  throw new Error("No MS client credential configured: set MS_CLIENT_CERT_PRIVATE_KEY + MS_CLIENT_CERT_THUMBPRINT (or MS_CLIENT_SECRET).");
}

/** OAuth: exchange an authorization code for tokens (the connect flow). */
export async function msTokenFromCode(code: string, redirectUri: string) {
  const res = await fetch(`${msAuthority()}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      ...(await clientCredential()),
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
      ...(await clientCredential()),
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
