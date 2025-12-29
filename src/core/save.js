import { supabase } from "./supabaseClient.js";

// Retrieve the current authenticated user in a way that works across browsers/tabs.
// getUser() performs a network call to validate the JWT rather than only reading
// from local storage. Fallback to getSession() only when getUser() fails
// with a missing session error. This helps maintain consistent identity when
// players open multiple tabs or browsers.
async function getAuthUserSafe() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error && !isMissingSession(error)) throw error;
    if (user) return user;
  } catch (e) {
    // Fall through to getSession() fallback below
  }
  // Fallback: try to get the user from the current session (local storage)
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error && !isMissingSession(error)) throw error;
  return sessionData?.session?.user ?? null;
}

function isMissingSession(err) {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return msg.includes("auth session missing");
}

export async function loadSave() {
  const user = await getAuthUserSafe();
  if (!user) return null;
  const { data, error } = await supabase
    .from("saves")
    .select("state_json")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.state_json ?? null;
}

export async function saveState(state) {
  const user = await getAuthUserSafe();
  if (!user) return;

  const payload = {
    user_id: user.id,
    state_json: state,
    last_seen_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("saves").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

export async function wipeMySave(defaultStateFactory) {
  const fresh = defaultStateFactory();
  await saveState(fresh);
  return fresh;
}
