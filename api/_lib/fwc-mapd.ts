const DEFAULT_BASE_URL = "https://api.fwc.gov.au/api/v1";
const SUBSCRIPTION_HEADER = "Ocp-Apim-Subscription-Key";

export interface MapdPage<T = Record<string, unknown>> {
  _meta?: {
    current_page?: number;
    page_count?: number;
    limit?: number;
    result_count?: number;
    has_more_results?: boolean;
  };
  results?: T[];
  _links?: Array<Record<string, unknown>>;
}

export interface MapdSnapshot<T> {
  source: "Fair Work Commission Modern Awards Pay Database API";
  retrievedAt: string;
  requestUrl: string;
  etag: string | null;
  interpretationPerformed: false;
  payload: T;
}

export interface MapdClientOptions {
  subscriptionKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function requireSubscriptionKey(value: string) {
  const key = value.trim();
  if (!key) throw new Error("FWC_MAPD_SUBSCRIPTION_KEY is required.");
  return key;
}

export function createMapdClient(options: MapdClientOptions) {
  const subscriptionKey = requireSubscriptionKey(options.subscriptionKey);
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());

  async function get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    etag?: string,
  ): Promise<MapdSnapshot<T> | { notModified: true }> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new Error("FWC MAPD paths must be relative API paths.");
    }

    const url = new URL(`${baseUrl}${path}`);
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      [SUBSCRIPTION_HEADER]: subscriptionKey,
    };
    if (etag) headers["If-None-Match"] = etag;

    const response = await fetchImpl(url, { method: "GET", headers });
    if (response.status === 304) return { notModified: true };
    if (!response.ok) {
      throw new Error(`FWC MAPD request failed with HTTP ${response.status}.`);
    }

    return {
      source: "Fair Work Commission Modern Awards Pay Database API",
      retrievedAt: now().toISOString(),
      requestUrl: url.toString(),
      etag: response.headers.get("etag"),
      interpretationPerformed: false,
      payload: (await response.json()) as T,
    };
  }

  return {
    get,
    getAwards: (name: string, page = 1, limit = 100, etag?: string) =>
      get<MapdPage>("/awards", {
        name,
        page,
        limit,
        sort: "code asc",
      }, etag),
  };
}

export function getMapdServerConfig() {
  return {
    subscriptionKey: requireSubscriptionKey(process.env.FWC_MAPD_SUBSCRIPTION_KEY ?? ""),
    baseUrl: process.env.FWC_MAPD_BASE_URL || DEFAULT_BASE_URL,
  };
}
