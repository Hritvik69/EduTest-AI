import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

export const supabase =
  supabaseUrl?.startsWith("http") && serviceKey && !serviceKey.startsWith("your_")
    ? createClient(supabaseUrl, serviceKey)
    : null;
