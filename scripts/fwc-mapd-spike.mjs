import process from "node:process";

const baseUrl = (process.env.FWC_MAPD_BASE_URL || "https://api.fwc.gov.au/api/v1").replace(/\/$/, "");
const subscriptionKey = (process.env.FWC_MAPD_SUBSCRIPTION_KEY || "").trim();

if (!subscriptionKey) {
  console.error("FWC_MAPD_SUBSCRIPTION_KEY is required.");
  process.exitCode = 1;
} else {
  const url = new URL(`${baseUrl}/awards`);
  url.searchParams.set("name", "Cleaning Services");
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "100");
  url.searchParams.set("sort", "code asc");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Ocp-Apim-Subscription-Key": subscriptionKey,
    },
  });

  if (!response.ok) {
    console.error(`FWC MAPD spike failed with HTTP ${response.status}.`);
    process.exitCode = 1;
  } else {
    const payload = await response.json();
    const awards = Array.isArray(payload.results) ? payload.results : [];
    const matches = awards.map((award) => ({
      code: award.code,
      name: award.name,
      award_fixed_id: award.award_fixed_id,
      award_operative_from: award.award_operative_from,
      award_operative_to: award.award_operative_to,
      version_number: award.version_number,
      last_modified_datetime: award.last_modified_datetime,
    }));

    console.log(JSON.stringify({
      source: "Fair Work Commission Modern Awards Pay Database API",
      retrieved_at: new Date().toISOString(),
      query: "Cleaning Services",
      interpretation_performed: false,
      result_count: matches.length,
      awards: matches,
    }, null, 2));
  }
}
