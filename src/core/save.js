import { supabase } from "./supabaseClient.js";

export async function loadSave() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) return;

  const payload = {
    user_id: user.id,
    state_json: state,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("saves")
    .upsert(payload, { onConflict: "user_id" });

  if (error) throw error;
}

export async function wipeMySave(defaultStateFactory) {
  const fresh = defaultStateFactory();
  await saveState(fresh);
  return fresh;
}