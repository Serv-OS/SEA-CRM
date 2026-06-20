// Per-user Microsoft 365 calendar via Graph. Mirrors google-calendar:
//   { action:'list', timeMin, timeMax }  -> events in a window
//   (default)  { title, start, end, attendees, location, subject_type, subject_id, contact_id } -> create + invite
// Auth: caller's JWT -> their user_integrations (provider='microsoft') token.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { graph, msTokenFromRefresh, MS_GRAPH } from "../_shared/microsoft.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!auth) return json({ error: "Unauthorized" }, 401);
  const { data: { user } } = await supabase.auth.getUser(auth);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: integ } = await supabase.from("user_integrations").select("*").eq("profile_id", user.id).maybeSingle();
  if (!integ?.refresh_token || integ.provider !== "microsoft") {
    return json({ error: "Connect your Outlook account first (My Account → Connect Microsoft)." }, 400);
  }

  // Fresh access token (persist the rotated refresh token).
  let accessToken = integ.access_token;
  if (!accessToken || !integ.token_expires_at || new Date(integ.token_expires_at).getTime() - Date.now() < 60000) {
    const tok = await msTokenFromRefresh(integ.refresh_token);
    accessToken = tok.access_token;
    await supabase.from("user_integrations").update({
      access_token: accessToken, token_expires_at: new Date(Date.now() + (tok.expires_in || 3600) * 1000).toISOString(),
      ...(tok.refresh_token ? { refresh_token: tok.refresh_token } : {}), updated_at: new Date().toISOString(),
    }).eq("id", integ.id);
  }

  // Graph returns datetimes in the Prefer timezone (UTC) without an offset —
  // normalise to a real ISO instant the browser can parse.
  const toIso = (dt?: string) => dt ? dt.split(".")[0] + "Z" : null;

  try {
    const body = await req.json();

    if (body.action === "list") {
      const timeMin = body.timeMin ? new Date(body.timeMin).toISOString() : new Date().toISOString();
      const timeMax = body.timeMax ? new Date(body.timeMax).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString();
      const url = `${MS_GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(timeMin)}&endDateTime=${encodeURIComponent(timeMax)}&$orderby=${encodeURIComponent("start/dateTime")}&$top=100`;
      const data = await graph(accessToken, url, { headers: { Prefer: 'outlook.timezone="UTC"' } }) as { value?: any[] };
      const events = (data.value || []).map((e) => ({
        id: e.id,
        summary: e.subject || "(no title)",
        description: e.bodyPreview || "",
        location: e.location?.displayName || "",
        start: toIso(e.start?.dateTime),
        end: toIso(e.end?.dateTime),
        allDay: !!e.isAllDay,
        htmlLink: e.webLink,
        hangoutLink: e.onlineMeeting?.joinUrl || null,
        attendees: (e.attendees || []).map((a: any) => a.emailAddress?.address).filter(Boolean),
        status: e.responseStatus?.response || "",
      }));
      return json({ events });
    }

    // ---- CREATE (default) ----
    const { title, description, start, end, attendees = [], subject_type, subject_id, contact_id, location } = body;
    if (!title || !start) return json({ error: "Missing title or start time" }, 422);

    const g = (iso: string) => ({ dateTime: new Date(iso).toISOString().replace("Z", ""), timeZone: "UTC" });
    const startISO = new Date(start).toISOString();
    const endISO = new Date(end || (new Date(start).getTime() + 30 * 60000)).toISOString();

    const event: Record<string, unknown> = {
      subject: title,
      body: { contentType: "text", content: description || "" },
      start: g(startISO),
      end: g(endISO),
      attendees: (attendees || []).filter(Boolean).map((e: string) => ({ emailAddress: { address: e }, type: "required" })),
    };
    if (location) event.location = { displayName: location };

    const ev = await graph(accessToken, `${MS_GRAPH}/me/events`, { method: "POST", body: JSON.stringify(event) }) as any;

    if (subject_type && subject_id) {
      await supabase.from("crm_activities").insert({
        type: "meeting", subject: title,
        body: `Meeting scheduled for ${new Date(startISO).toLocaleString("en-US")}${attendees.length ? ` with ${attendees.join(", ")}` : ""}.${description ? `\n${description}` : ""}`,
        subject_type, subject_id, contact_id: contact_id || null,
        actor_id: user.id, direction: "outbound", is_internal: false, occurred_at: startISO,
        channel_metadata: { calendar_event_id: ev.id, html_link: ev.webLink, attendees },
      });
    }

    return json({ success: true, event_id: ev.id, html_link: ev.webLink });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
