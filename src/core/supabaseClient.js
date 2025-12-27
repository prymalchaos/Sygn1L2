import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  "https://raqqtppbtbcvkkenyqye.supabase.co",
  "sb_publishable_T913yWlRXNOAJt_rp81R8Q_NLshMz_i",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);