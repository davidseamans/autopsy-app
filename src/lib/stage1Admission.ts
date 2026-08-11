import { supabase } from "@/lib/supabase";

export async function getAuthorizedStage1Admission(
  runId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc(
    "get_authorized_stage1_admission",
    { p_run_id: runId },
  );

  return !error && data === true;
}
