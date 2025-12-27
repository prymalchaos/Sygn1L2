import { supabase } from "./supabaseClient.js";

export async function loadSave() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("saves")
    .select("state_json")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.state_json ?? null;
}

export async function saveState(state) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("saves").upsert({
    user_id: user.id,
    state_json: state,
    last_seen_at: new Date().toISOString()
  });
}