// The only module that talks to GitHub: one GraphQL query for the profile data the terminal shows.

export const DAY_MS = 24 * 60 * 60 * 1000;

const GRAPHQL_URL = "https://api.github.com/graphql";

const PROFILE_QUERY = `
query ($login: String!, $from: DateTime!) {
  user(login: $login) {
    repositories(first: 30, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false,
                 orderBy: { field: PUSHED_AT, direction: DESC }) {
      nodes { name description pushedAt isArchived primaryLanguage { name color } }
    }
    contributionsCollection(from: $from) {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
      restrictedContributionsCount
    }
  }
}`;

/**
 * @typedef {{ name: string, color: string | null }} Language
 * @typedef {{
 *   name: string,
 *   description: string | null,
 *   pushedAt: string,
 *   isArchived: boolean,
 *   primaryLanguage: Language | null,
 * }} Repo
 * @typedef {{
 *   contributionCalendar: { totalContributions: number },
 *   totalCommitContributions: number,
 *   totalPullRequestContributions: number,
 *   restrictedContributionsCount: number,
 * }} Activity
 * @typedef {{ repositories: { nodes: Repo[] }, contributionsCollection: Activity }} Profile
 */

/**
 * Fetches the public repos (most recently pushed first) and the last 12 months of activity.
 *
 * @example
 * const profile = await fetchProfile({ login: "octocat", token, now: Date.now(), fetch });
 *
 * @param {{ login: string, token: string | undefined, now: number, fetch: typeof globalThis.fetch }} options
 * @returns {Promise<Profile>}
 */
export async function fetchProfile({ login, token, now, fetch }) {
  if (!token) throw new Error("expected a GitHub token in GITHUB_TOKEN, got nothing");
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: PROFILE_QUERY,
      variables: { login, from: new Date(now - 365 * DAY_MS).toISOString() },
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(
      `expected GitHub GraphQL data for "${login}", got HTTP ${response.status}: ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }
  return payload.data.user;
}
