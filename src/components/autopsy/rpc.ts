import { supabase } from "@/lib/supabase";

export interface GatewayQuestion {
  question_id: string | number;
  dimension_code: string;
  prompt: string;
  position: number;
  options: Array<{
    option_id?: string | number;
    value?: string | number;
    label: string;
    selected?: boolean;
  } | string>;
  selected_option?: string | number | null;
  answered?: boolean;
}

export interface GatewayPayload {
  run?: Record<string, any>;
  questions?: GatewayQuestion[];
  [key: string]: any;
}

async function rpc<T = any>(fn: string, args: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    const err: any = new Error(error.message || `RPC ${fn} failed`);
    err.rpc = fn;
    err.details = error;
    throw err;
  }
  return data as T;
}

export const createAutopsyRun = (params: {
  industry: string;
  scenario: string;
  run_name: string;
  tester_email: string;
}) =>
  rpc<any>("create_autopsy_run", {
    p_industry: params.industry,
    p_run_name: params.run_name,
    p_scenario: params.scenario,
    p_tester_email: params.tester_email,
  });

export const getGatewayPayload = (run_id: string) =>
  rpc<GatewayPayload>("get_autopsy_gateway_payload", { p_run_id: run_id });

export const recordAutopsyAnswer = (params: {
  run_id: string;
  question_id: string | number;
  selected_option: string | number;
}) =>
  rpc("record_autopsy_answer", {
    p_run_id: params.run_id,
    p_question_id: params.question_id,
    p_selected_option: params.selected_option,
  });

export const finalizeAutopsyRun = (run_id: string) =>
  rpc("finalize_autopsy_run", { p_run_id: run_id });

export function extractRunId(data: any): string | null {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    if (data.run_id) return String(data.run_id);
    if (data.id) return String(data.id);
    if (Array.isArray(data) && data[0]) return extractRunId(data[0]);
  }
  return null;
}