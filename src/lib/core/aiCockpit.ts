export type SignalSeverity = "green" | "amber" | "red";
export type TenantMaturity = "control_1" | "control_2" | "manage_1" | "manage_2" | "manage_3";

export interface CockpitSignal {
  id: string;
  tenantId: string;
  severity: SignalSeverity;
  title: string;
  consequence: string | null;
  ownerRole: string | null;
  nextAction: string | null;
  evidenceRefs: string[];
  visibleToRoles: string[];
}

export interface AiRecommendation {
  id: string;
  tenantId: string;
  statement: string;
  evidenceRefs: string[];
  uncertainties: string[];
}

export interface ActorAuthority {
  actorId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  approvalLimit: number | null;
}

export interface ConversationalActionRequest {
  id: string;
  tenantId: string;
  actionType: string;
  requiredPermission: string;
  amount: number | null;
  evidenceRefs: string[];
  routine: boolean;
}

export interface PreparedAction {
  id: string;
  tenantId: string;
  actionType: string;
  status: "ready" | "approval_required" | "blocked";
  reason: string | null;
  preparedBy: string;
  evidenceRefs: string[];
  staffInterventionRequired: false;
}

export interface OwnerFinancialPosition {
  cashFlow: { amount: number; sourceRef: string };
  grossContribution: { amount: number; sourceRef: string };
  indicativeNetMargin: { amount: number; sourceRef: string; indicative: true };
}

const MATURITY_ORDER: TenantMaturity[] = ["control_1", "control_2", "manage_1", "manage_2", "manage_3"];

function requireValue(label: string, value: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
}

export function validateCockpitSignal(signal: CockpitSignal): CockpitSignal {
  requireValue("Signal identity", signal.id);
  requireValue("Tenant identity", signal.tenantId);
  if (signal.visibleToRoles.length === 0) throw new Error("A signal requires at least one permitted role.");
  if (signal.severity !== "green") {
    if (!signal.consequence?.trim()) throw new Error("Amber and red signals require a consequence.");
    if (!signal.ownerRole?.trim()) throw new Error("Amber and red signals require an owner.");
    if (!signal.nextAction?.trim()) throw new Error("Amber and red signals require a next action.");
    if (signal.evidenceRefs.length === 0) throw new Error("Amber and red signals require evidence.");
  }
  return { ...signal };
}

export function buildCockpitView(input: {
  tenantId: string;
  role: string;
  signals: CockpitSignal[];
  includeGreen?: boolean;
}): CockpitSignal[] {
  return input.signals
    .filter((signal) => signal.tenantId === input.tenantId)
    .map(validateCockpitSignal)
    .filter((signal) => signal.visibleToRoles.includes(input.role))
    .filter((signal) => input.includeGreen || signal.severity !== "green")
    .sort((left, right) => ({ red: 0, amber: 1, green: 2 })[left.severity] - ({ red: 0, amber: 1, green: 2 })[right.severity]);
}

export function validateAiRecommendation(recommendation: AiRecommendation): AiRecommendation {
  requireValue("Recommendation identity", recommendation.id);
  requireValue("Tenant identity", recommendation.tenantId);
  requireValue("Recommendation statement", recommendation.statement);
  if (recommendation.evidenceRefs.length === 0) {
    throw new Error("AI recommendations must identify supporting evidence.");
  }
  return { ...recommendation };
}

export function prepareConversationalAction(
  request: ConversationalActionRequest,
  authority: ActorAuthority,
): PreparedAction {
  requireValue("Action identity", request.id);
  if (request.tenantId !== authority.tenantId) {
    return {
      id: request.id,
      tenantId: request.tenantId,
      actionType: request.actionType,
      status: "blocked",
      reason: "Actor authority belongs to another Tenant.",
      preparedBy: authority.actorId,
      evidenceRefs: request.evidenceRefs,
      staffInterventionRequired: false,
    };
  }
  if (!authority.permissions.includes(request.requiredPermission)) {
    return {
      id: request.id,
      tenantId: request.tenantId,
      actionType: request.actionType,
      status: "blocked",
      reason: `Missing permission: ${request.requiredPermission}`,
      preparedBy: authority.actorId,
      evidenceRefs: request.evidenceRefs,
      staffInterventionRequired: false,
    };
  }
  if (request.amount !== null && (authority.approvalLimit === null || request.amount > authority.approvalLimit)) {
    return {
      id: request.id,
      tenantId: request.tenantId,
      actionType: request.actionType,
      status: "approval_required",
      reason: "Action exceeds the actor approval limit.",
      preparedBy: authority.actorId,
      evidenceRefs: request.evidenceRefs,
      staffInterventionRequired: false,
    };
  }
  return {
    id: request.id,
    tenantId: request.tenantId,
    actionType: request.actionType,
    status: "ready",
    reason: null,
    preparedBy: authority.actorId,
    evidenceRefs: request.evidenceRefs,
    staffInterventionRequired: false,
  };
}

export function recommendTenantMaturity(input: {
  current: TenantMaturity;
  demonstratedCapabilities: string[];
  requiredCapabilitiesByLevel: Partial<Record<TenantMaturity, string[]>>;
}): { recommended: TenantMaturity; missingForNext: string[] } {
  const currentIndex = MATURITY_ORDER.indexOf(input.current);
  const next = MATURITY_ORDER[currentIndex + 1];
  if (!next) return { recommended: input.current, missingForNext: [] };
  const demonstrated = new Set(input.demonstratedCapabilities);
  const missing = (input.requiredCapabilitiesByLevel[next] ?? []).filter((capability) => !demonstrated.has(capability));
  return { recommended: missing.length === 0 ? next : input.current, missingForNext: missing };
}

export function presentOwnerFinancialPosition(position: OwnerFinancialPosition) {
  for (const [label, metric] of Object.entries(position)) {
    if (!Number.isFinite(metric.amount) || !metric.sourceRef.trim()) {
      throw new Error(`${label} requires a finite amount and evidence source.`);
    }
  }
  return [
    { priority: 1, metric: "cash_flow" as const, ...position.cashFlow },
    { priority: 2, metric: "gross_contribution" as const, ...position.grossContribution },
    { priority: 3, metric: "indicative_net_margin" as const, ...position.indicativeNetMargin },
  ];
}
