import { describe, expect, it, vi } from "vitest";
import { createMapdClient } from "../../api/_lib/fwc-mapd";

describe("FWC MAPD Cleaning Sleeve adapter", () => {
  it("uses the official subscription header and preserves source evidence", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      _meta: { result_count: 1 },
      results: [{
        code: "MA000022",
        name: "Cleaning Services Award 2020",
        award_fixed_id: "award-22",
        award_operative_from: "2020-01-01",
      }],
    }), { status: 200, headers: { etag: '"v22"' } }));

    const client = createMapdClient({
      subscriptionKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
    });
    const snapshot = await client.getAwards("Cleaning Services");

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("/api/v1/awards?name=Cleaning+Services");
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": "test-key",
    });
    expect(snapshot).toMatchObject({
      source: "Fair Work Commission Modern Awards Pay Database API",
      etag: '"v22"',
      interpretationPerformed: false,
      payload: { _meta: { result_count: 1 } },
    });
  });

  it("supports conditional retrieval without replacing last-known-good data", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 304 }));
    const client = createMapdClient({
      subscriptionKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.getAwards("Cleaning Services", 1, 100, '"v22"'))
      .resolves.toEqual({ notModified: true });
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({
      "If-None-Match": '"v22"',
    });
  });

  it("rejects missing keys and non-relative API paths", async () => {
    expect(() => createMapdClient({ subscriptionKey: " " }))
      .toThrow("FWC_MAPD_SUBSCRIPTION_KEY is required.");
    const client = createMapdClient({ subscriptionKey: "test-key" });
    await expect(client.get("https://example.com/exfiltrate"))
      .rejects.toThrow("relative API paths");
  });
});
