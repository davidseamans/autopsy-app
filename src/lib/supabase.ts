import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fzbdztapkyrfwjwxtwte.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_WEK7ccOjOeJ8UdIhdVQIcg_rEwCK2q-";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

export const isDebug = () => {
  try {
    return localStorage.getItem("autopsy_debug") === "1";
  } catch {
    return false;
  }
};