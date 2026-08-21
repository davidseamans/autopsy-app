import { supabase } from "@/lib/supabase";

export type AbnPath = "already_have_abn" | "apply_for_abn";
export type BusinessNamePath = "own_legal_name" | "register_business_name";

export type Stage1OnboardingProgress = {
  abnPath: AbnPath | null;
  businessNamePath: BusinessNamePath | null;
  savedAt: string | null;
};

type ProgressRow = {
  abn_path: AbnPath | null;
  business_name_path: BusinessNamePath | null;
  completed_at: string | null;
};

const emptyProgress: Stage1OnboardingProgress = {
  abnPath: null,
  businessNamePath: null,
  savedAt: null,
};

function fromRow(row: ProgressRow | null): Stage1OnboardingProgress {
  if (!row) return emptyProgress;
  return {
    abnPath: row.abn_path,
    businessNamePath: row.business_name_path,
    savedAt: row.completed_at,
  };
}

export async function fetchStage1Onboarding(runId: string): Promise<Stage1OnboardingProgress> {
  const { data, error } = await supabase
    .from("stage1_onboarding_progress")
    .select("abn_path,business_name_path,completed_at")
    .eq("autopsy_run_id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return fromRow(data as ProgressRow | null);
}

export async function saveStage1Onboarding(
  runId: string,
  progress: Pick<Stage1OnboardingProgress, "abnPath" | "businessNamePath">,
): Promise<Stage1OnboardingProgress> {
  const { data, error } = await supabase.rpc("save_stage1_setup_choices", {
    p_run_id: runId,
    p_abn_path: progress.abnPath,
    p_business_name_path: progress.businessNamePath,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ProgressRow | null;
  return fromRow(row);
}
