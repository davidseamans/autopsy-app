import { supabase } from "@/lib/supabase";

export type AbnPath = "already_have_abn" | "apply_for_abn";
export type BusinessNamePath = "own_legal_name" | "register_business_name";

export type Stage1OnboardingProgress = {
  welcomeAcknowledged: boolean;
  abnPath: AbnPath | null;
  businessNamePath: BusinessNamePath | null;
  operatingStandardsAcknowledged: boolean;
  completedAt: string | null;
};

type ProgressRow = {
  welcome_acknowledged: boolean;
  abn_path: AbnPath | null;
  business_name_path: BusinessNamePath | null;
  operating_standards_acknowledged: boolean;
  completed_at: string | null;
};

const emptyProgress: Stage1OnboardingProgress = {
  welcomeAcknowledged: false,
  abnPath: null,
  businessNamePath: null,
  operatingStandardsAcknowledged: false,
  completedAt: null,
};

function fromRow(row: ProgressRow | null): Stage1OnboardingProgress {
  if (!row) return emptyProgress;
  return {
    welcomeAcknowledged: row.welcome_acknowledged,
    abnPath: row.abn_path,
    businessNamePath: row.business_name_path,
    operatingStandardsAcknowledged: row.operating_standards_acknowledged,
    completedAt: row.completed_at,
  };
}

export async function fetchStage1Onboarding(runId: string): Promise<Stage1OnboardingProgress> {
  const { data, error } = await supabase
    .from("stage1_onboarding_progress")
    .select("welcome_acknowledged,abn_path,business_name_path,operating_standards_acknowledged,completed_at")
    .eq("autopsy_run_id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return fromRow(data as ProgressRow | null);
}

export async function saveStage1Onboarding(
  runId: string,
  progress: Omit<Stage1OnboardingProgress, "completedAt">,
): Promise<Stage1OnboardingProgress> {
  const { data, error } = await supabase.rpc("save_stage1_onboarding_progress", {
    p_run_id: runId,
    p_welcome_acknowledged: progress.welcomeAcknowledged,
    p_abn_path: progress.abnPath,
    p_business_name_path: progress.businessNamePath,
    p_operating_standards_acknowledged: progress.operatingStandardsAcknowledged,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ProgressRow | null;
  return fromRow(row);
}

