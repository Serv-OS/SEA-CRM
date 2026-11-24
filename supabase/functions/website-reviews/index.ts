// Google reviews for the website (read only).
//   GET -> { ok, rating, count, url, reviews: [{ id, rating, text, author, date, url }] }
//
// Uses the Places API with the GOOGLE_MAPS_API_KEY this project already has.
// Google only hands out five reviews per call, so every review we have ever
// been given is kept in server_settings (key google_reviews) and the list
// grows as new reviews arrive. Google is asked at most once every 12 hours;
// in between, callers get the saved copy. No input is read from the caller,
// so the endpoint cannot be pointed at another business.
//
// Add ?debug=1 to see what Google answered (no key is ever returned).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const QUERY = "SEA Design Build, 763 Polhemus Road, San Mateo, CA 94402";
const CACHE_KEY = "google_reviews";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

type Review = { id: string; rating: number; text: string; author: string; date: string | null; url: string | null };
type Saved = { fetchedAt: number; placeId: string; rating: number; count: number; url: string; reviews: Review[] };

/** First name and last initial only: a full surname never reaches the website. */
const shortName = (name: string) => {
  const p = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "Homeowner";
  return p.length === 1 ? p[0] : `${p[0]} ${p[p.length - 1][0].toUpperCase()}.`;
};
const idFor = (author: string, when: string | number) => `g-${String(author).toLowerCase().replace(/[^a-z0-9]+/g, "")}-${when}`;

// deno-lint-ignore no-explicit-any
type Any = any;

/** Places API (New). Returns null when the API is not enabled for the key. */
async function fromNewApi(key: string, placeId: string, notes: string[]): Promise<Omit<Saved, "fetchedAt"> | null> {
  let id = placeId;
  if (!id) {
    const s = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName" },
      body: JSON.stringify({ textQuery: QUERY }),
    });
    const sj: Any = await s.json().catch(() => ({}));
    if (!s.ok) { notes.push(`new search ${s.status}: ${sj?.error?.status || ""} ${String(sj?.error?.message || "").slice(0, 160)}`); return null; }
    id = sj?.places?.[0]?.id || "";
    if (!id) { notes.push("new search: no place found"); return null; }
  }
  const d = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,googleMapsUri,reviews" },
  });
  const dj: Any = await d.json().catch(() => ({}));
  if (!d.ok) { notes.push(`new details ${d.status}: ${dj?.error?.status || ""} ${String(dj?.error?.message || "").slice(0, 160)}`); return null; }
  const reviews: Review[] = (dj.reviews || []).filter((r: Any) => (r.originalText?.text || r.text?.text)).map((r: Any) => {
    const name = r.authorAttribution?.displayName || "";
    return {
      id: idFor(name, r.publishTime || ""), rating: Number(r.rating) || 5, text: String(r.originalText?.text || r.text?.text),
      author: shortName(name), date: r.publishTime || null, url: r.googleMapsUri || null,
    };
  });
  return { placeId: id, rating: Number(dj.rating) || 0, count: Number(dj.userRatingCount) || 0, url: dj.googleMapsUri || "", reviews };
}

/** The older Places API, which can also sort by newest. */
async function fromOldApi(key: string, placeId: string, notes: string[]): Promise<Omit<Saved, "fetchedAt"> | null> {
  let id = placeId;
  if (!id) {
    const f: Any = await fetch(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(QUERY)}&inputtype=textquery&fields=place_id&key=${key}`).then((r) => r.json()).catch(() => ({}));
    if (f.status !== "OK") { notes.push(`old find: ${f.status} ${String(f.error_message || "").slice(0, 160)}`); return null; }
    id = f.candidates?.[0]?.place_id || "";
    if (!id) return null;
  }
  const out: Omit<Saved, "fetchedAt"> = { placeId: id, rating: 0, count: 0, url: "", reviews: [] };
  for (const sort of ["most_relevant", "newest"]) {
    const d: Any = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=rating,user_ratings_total,url,reviews&reviews_sort=${sort}&reviews_no_translations=true&key=${key}`).then((r) => r.json()).catch(() => ({}));
    if (d.status !== "OK") { notes.push(`old details ${sort}: ${d.status} ${String(d.error_message || "").slice(0, 160)}`); continue; }
    out.rating = Number(d.result?.rating) || out.rating;
    out.count = Number(d.result?.user_ratings_total) || out.count;
    out.url = d.result?.url || out.url;
    for (const r of d.result?.reviews || []) {
      if (!r.text) continue;
      const iso = r.time ? new Date(r.time * 1000).toISOString() : null;
      out.reviews.push({ id: idFor(r.author_name, iso || ""), rating: Number(r.rating) || 5, text: String(r.text), author: shortName(r.author_name), date: iso, url: out.url || null });
    }
  }
  return out.rating || out.reviews.length ? out : null;
}

/** Same person and same words = same review, whichever API it came from. */
const sameKey = (r: Review) => `${r.author}|${r.text.slice(0, 60)}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const debug = new URL(req.url).searchParams.get("debug") === "1";
  const notes: string[] = [];
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let saved: Saved | null = null;
    const { data: row, error: readErr } = await supabase.from("server_settings").select("value").eq("key", CACHE_KEY).maybeSingle();
    if (readErr) notes.push(`cache read: ${readErr.message}`);
    try { saved = row?.value ? JSON.parse(row.value) : null; } catch { saved = null; }

    const fresh = saved && Date.now() - saved.fetchedAt < MAX_AGE_MS;
    if (!fresh) {
      const key = (Deno.env.get("GOOGLE_MAPS_API_KEY") || "").trim().replace(/^["']+|["']+$/g, "");
      if (!key) notes.push("no GOOGLE_MAPS_API_KEY");
      else {
        const placeId = saved?.placeId || "";
        const a = await fromNewApi(key, placeId, notes);
        const b = await fromOldApi(key, a?.placeId || placeId, notes);
        const got = a || b;
        if (got) {
          const seen = new Map<string, Review>();
          for (const r of [...(saved?.reviews || []), ...(a?.reviews || []), ...(b?.reviews || [])]) if (!seen.has(sameKey(r))) seen.set(sameKey(r), r);
          const reviews = [...seen.values()].sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
          saved = { fetchedAt: Date.now(), placeId: got.placeId, rating: a?.rating || b?.rating || 0, count: a?.count || b?.count || 0, url: a?.url || b?.url || "", reviews };
          const { error: writeErr } = await supabase.from("server_settings").upsert({ key: CACHE_KEY, value: JSON.stringify(saved), updated_at: new Date().toISOString() });
          if (writeErr) notes.push(`cache write: ${writeErr.message}`);
        }
      }
    }
    if (!saved) return json({ ok: false, reviews: [], ...(debug ? { notes } : {}) });
    return json({ ok: true, rating: saved.rating, count: saved.count, url: saved.url, fetchedAt: new Date(saved.fetchedAt).toISOString(), reviews: saved.reviews, ...(debug ? { notes } : {}) });
  } catch (e) {
    return json({ ok: false, reviews: [], ...(debug ? { notes: [...notes, (e as Error).message] } : {}) });
  }
});
