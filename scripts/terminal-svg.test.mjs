import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchProfile } from "./github-profile.mjs";
import {
  activitySummary,
  escapeXml,
  listedRepos,
  renderTerminal,
  timeSince,
  truncate,
} from "./terminal-svg.mjs";

const NOW = Date.parse("2026-10-21T12:00:00Z");

/** @returns {import("./github-profile.mjs").Repo} */
function repo(overrides = {}) {
  return {
    name: "payments",
    description: "Async payments on SQS",
    pushedAt: "2026-10-21T08:00:00Z",
    isArchived: false,
    primaryLanguage: { name: "Java", color: "#b07219" },
    ...overrides,
  };
}

/** @returns {import("./github-profile.mjs").Profile} */
function profileWith(repos) {
  return {
    repositories: { nodes: repos },
    contributionsCollection: {
      contributionCalendar: { totalContributions: 422 },
      totalCommitContributions: 156,
      totalPullRequestContributions: 10,
      restrictedContributionsCount: 219,
    },
  };
}

// Stands in for the global fetch: answers every request with one canned GraphQL response.
class FakeGraphqlEndpoint {
  constructor(status, payload) {
    this.status = status;
    this.payload = payload;
    this.requests = [];
  }

  fetch = async (url, init) => {
    this.requests.push({ url, body: JSON.parse(init.body) });
    return { ok: this.status < 400, status: this.status, json: async () => this.payload };
  };
}

describe("listedRepos", () => {
  it("keeps described, active repos and drops the profile repo", () => {
    const profile = profileWith([
      repo({ name: "kept" }),
      repo({ name: "undescribed", description: null }),
      repo({ name: "archived", isArchived: true }),
      repo({ name: "octocat" }),
    ]);

    assert.deepEqual(
      listedRepos(profile, "octocat").map((r) => r.name),
      ["kept"],
    );
  });
});

describe("timeSince", () => {
  it("reads as days, then weeks, then months", () => {
    assert.equal(timeSince("2026-10-21T08:00:00Z", NOW), "today");
    assert.equal(timeSince("2026-10-14T12:00:00Z", NOW), "7d ago");
    assert.equal(timeSince("2026-09-23T12:00:00Z", NOW), "4w ago");
    assert.equal(timeSince("2026-06-23T12:00:00Z", NOW), "4mo ago");
  });
});

describe("truncate", () => {
  it("leaves short text alone and ends long text with an ellipsis within the limit", () => {
    assert.equal(truncate("short", 10), "short");
    assert.equal(truncate("a description that is too long", 10), "a descrip…");
  });
});

describe("escapeXml", () => {
  it("escapes the characters that would break the SVG", () => {
    assert.equal(escapeXml(`<a & "b">`), "&#60;a &#38; &#34;b&#34;&#62;");
  });
});

describe("activitySummary", () => {
  it("lists contributions, public commits, pull requests and private contributions", () => {
    assert.equal(
      activitySummary(profileWith([]).contributionsCollection),
      "422 contributions · 156 public commits · 10 pull requests · 219 in private repos",
    );
  });
});

describe("renderTerminal", () => {
  const svg = renderTerminal(profileWith([repo({ name: "a<b" }), repo({ name: "second" })]), {
    login: "octocat",
    question: "what is octocat shipping?",
    now: NOW,
  });

  it("produces one SVG document titled with the login", () => {
    assert.match(svg, /^<svg [^>]*role="img"/);
    assert.match(svg, /~\/octocat/);
    assert.match(svg, /<\/svg>\n$/);
  });

  it("lists the repos with escaped names and the redraw date", () => {
    assert.match(svg, /a&#60;b/);
    assert.match(svg, /second/);
    assert.match(svg, /redrawn daily by GitHub Actions · 2026-10-21/);
  });
});

describe("fetchProfile", () => {
  it("asks for the last 365 days of the given login and returns the user", async () => {
    const endpoint = new FakeGraphqlEndpoint(200, { data: { user: profileWith([]) } });

    const profile = await fetchProfile({ login: "octocat", token: "t", now: NOW, fetch: endpoint.fetch });

    assert.equal(profile.contributionsCollection.totalCommitContributions, 156);
    assert.deepEqual(endpoint.requests[0].body.variables, {
      login: "octocat",
      from: "2025-10-21T12:00:00.000Z",
    });
  });

  it("refuses to run without a token", async () => {
    const endpoint = new FakeGraphqlEndpoint(200, {});

    await assert.rejects(
      fetchProfile({ login: "octocat", token: undefined, now: NOW, fetch: endpoint.fetch }),
      /expected a GitHub token/,
    );
  });

  it("reports the status and the GraphQL errors when the query fails", async () => {
    const endpoint = new FakeGraphqlEndpoint(200, { errors: [{ message: "bad login" }] });

    await assert.rejects(
      fetchProfile({ login: "octocat", token: "t", now: NOW, fetch: endpoint.fetch }),
      /HTTP 200: \[\{"message":"bad login"\}\]/,
    );
  });
});
