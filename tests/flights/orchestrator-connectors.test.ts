import assert from "node:assert/strict";
import test from "node:test";
import { createProductionFlightConnectors } from "../../lib/flights/connectors";
import { FixtureFlightConnector } from "../../lib/flights/connectors/fixture/connector";
import { orchestrateFlightSearch } from "../../lib/flights/core/search-orchestrator";
import { offer, searchRequest } from "./fixtures";

function setNodeEnvironment(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

setNodeEnvironment("test");

test("fixture connector cannot be constructed outside the test environment", () => {
  const original = process.env.NODE_ENV;
  setNodeEnvironment("production");
  try {
    assert.throws(() => new FixtureFlightConnector(), /NODE_ENV=test/);
  } finally {
    setNodeEnvironment(original);
  }
});

test("production connectors never fabricate offers when the live worker is not running", async () => {
  const response = await orchestrateFlightSearch(
    searchRequest(),
    createProductionFlightConnectors(),
    { searchId: "search-placeholder-test" },
  );
  assert.equal(response.status, "unavailable");
  assert.equal(response.summary.offerCount, 0);
  assert.equal(response.summary.integrationRequiredSourceCount, 4);
  assert.equal(response.sourceStatuses.find((source) => source.sourceId === "enuygun")?.state, "failed");
  assert(
    response.sourceStatuses
      .filter((source) => source.sourceId !== "enuygun")
      .every((source) => source.state === "integration_required"),
  );
});

test("a contract-compatible real adapter can replace its integration placeholder", async () => {
  const authorizedAdapter = new FixtureFlightConnector({
    source: { id: "enuygun", name: "Authorized Enuygun Adapter" },
    offers: [offer({ sourceOfferId: "authorized-offer" })],
  });
  const response = await orchestrateFlightSearch(
    searchRequest(),
    createProductionFlightConnectors({ enuygun: authorizedAdapter }),
    { searchId: "search-authorized-override-test" },
  );
  assert.equal(response.status, "completed");
  assert.equal(response.summary.offerCount, 1);
  assert.equal(response.summary.integrationRequiredSourceCount, 4);
  assert.equal(response.sourceStatuses.find((source) => source.sourceId === "enuygun")?.state, "succeeded");
});

test("one connector failure does not discard another connector's valid offers", async () => {
  const good = new FixtureFlightConnector({
    source: { id: "good-source", name: "Good Source" },
    offers: [offer({ sourceOfferId: "good-offer" })],
  });
  const failed = new FixtureFlightConnector({
    source: { id: "failed-source", name: "Failed Source" },
    error: new Error("Provider temporarily failed."),
  });
  const response = await orchestrateFlightSearch(searchRequest(), [failed, good], {
    searchId: "search-isolation-test",
    connectorTimeoutMs: 500,
  });
  assert.equal(response.status, "partial");
  assert.equal(response.summary.offerCount, 1);
  assert.equal(response.itineraries.length, 1);
  assert.equal(response.sourceStatuses.find((item) => item.sourceId === "failed-source")?.state, "failed");
  assert.equal(response.sourceStatuses.find((item) => item.sourceId === "good-source")?.state, "succeeded");
});

test("no-results and all-failed searches remain distinguishable", async () => {
  const empty = new FixtureFlightConnector({
    source: { id: "empty-source", name: "Empty Source" },
  });
  const emptyResponse = await orchestrateFlightSearch(searchRequest(), [empty], {
    searchId: "search-empty-test",
  });
  assert.equal(emptyResponse.status, "completed");
  assert.equal(emptyResponse.sourceStatuses[0].state, "no_results");
  assert.equal(emptyResponse.summary.offerCount, 0);

  const firstFailure = new FixtureFlightConnector({
    source: { id: "failure-one", name: "Failure One" },
    error: new Error("First private provider detail."),
  });
  const secondFailure = new FixtureFlightConnector({
    source: { id: "failure-two", name: "Failure Two" },
    error: new Error("Second private provider detail."),
  });
  const failedResponse = await orchestrateFlightSearch(
    searchRequest(),
    [firstFailure, secondFailure],
    { searchId: "search-all-failed-test" },
  );
  assert.equal(failedResponse.status, "unavailable");
  assert.equal(failedResponse.summary.failedSourceCount, 2);
  assert(failedResponse.sourceStatuses.every((source) => source.message === "Kaynak sorgusu başarısız."));
});

test("slow connectors time out without blocking completed sources", async () => {
  const good = new FixtureFlightConnector({
    source: { id: "instant-source", name: "Instant Source" },
    offers: [offer({ sourceOfferId: "instant-offer" })],
  });
  const slow = new FixtureFlightConnector({
    source: { id: "slow-source", name: "Slow Source" },
    offers: [offer({ sourceOfferId: "late-offer" })],
    delayMs: 300,
  });
  const response = await orchestrateFlightSearch(searchRequest(), [good, slow], {
    searchId: "search-timeout-test",
    connectorTimeoutMs: 100,
  });
  assert.equal(response.status, "partial");
  assert.equal(response.summary.offerCount, 1);
  assert.equal(response.sourceStatuses.find((item) => item.sourceId === "slow-source")?.state, "timed_out");
});

test("malformed source offers are rejected without poisoning valid sources", async () => {
  const valid = new FixtureFlightConnector({
    source: { id: "valid-source", name: "Valid Source" },
    offers: [offer({ sourceOfferId: "valid-offer" })],
  });
  const invalid = new FixtureFlightConnector({
    source: { id: "invalid-source", name: "Invalid Source" },
    offers: [offer({ sourceOfferId: "invalid-offer", checkoutUrl: "https://evil.example/pay" })],
  });
  const response = await orchestrateFlightSearch(searchRequest(), [valid, invalid], {
    searchId: "search-invalid-source-test",
  });
  assert.equal(response.status, "partial");
  assert.equal(response.summary.offerCount, 1);
  const status = response.sourceStatuses.find((item) => item.sourceId === "invalid-source");
  assert.equal(status?.state, "failed");
  assert.equal(status?.errorCode, "format_changed");
  assert.equal(status?.rejectedOfferCount, 1);
});

test("valid offers survive malformed siblings and make the response explicitly partial", async () => {
  const mixed = new FixtureFlightConnector({
    source: { id: "mixed-source", name: "Mixed Source" },
    offers: [
      offer({ sourceOfferId: "mixed-valid" }),
      offer({ sourceOfferId: "mixed-invalid", checkoutUrl: "https://evil.example/pay" }),
    ],
  });
  const response = await orchestrateFlightSearch(searchRequest(), [mixed], {
    searchId: "search-mixed-source-test",
  });
  assert.equal(response.status, "partial");
  assert.equal(response.summary.offerCount, 1);
  assert.equal(response.sourceStatuses[0].state, "succeeded");
  assert.equal(response.sourceStatuses[0].errorCode, "format_changed");
  assert.equal(response.sourceStatuses[0].rejectedOfferCount, 1);
});

test("connector outcomes that contradict their offer list are rejected", async () => {
  const contradictory = new FixtureFlightConnector({
    source: { id: "contradictory-source", name: "Contradictory Source" },
    outcome: "no_results",
    offers: [offer({ sourceOfferId: "must-not-leak" })],
  });
  const response = await orchestrateFlightSearch(searchRequest(), [contradictory], {
    searchId: "search-contradiction-test",
  });
  assert.equal(response.status, "unavailable");
  assert.equal(response.summary.offerCount, 0);
  assert.equal(response.sourceStatuses[0].state, "failed");
  assert.equal(response.sourceStatuses[0].errorCode, "format_changed");
  assert.equal(response.sourceStatuses[0].rejectedOfferCount, 1);
});
