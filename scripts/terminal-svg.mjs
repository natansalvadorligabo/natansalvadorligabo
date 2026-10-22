// Draws a terminal session where an agent answers "what is <login> shipping?"
// with the profile data. Pure: no I/O, so it can be tested with a fixture.

import { DAY_MS } from "./github-profile.mjs";

/** @typedef {import("./github-profile.mjs").Profile} Profile */
/** @typedef {import("./github-profile.mjs").Repo} Repo */
/** @typedef {import("./github-profile.mjs").Activity} Activity */

const LISTED_REPOS = 5;

const WIDTH = 960;
const LINE_HEIGHT = 24;
const TOP = 64;
const LEFT = 28;
const GLYPH_WIDTH = 8.4; // advance of a 14px monospace glyph
const COLUMNS = { name: 72, language: 300, pushed: 420 };
const DESCRIPTION_CHARS = Math.floor((WIDTH - COLUMNS.name - LEFT) / GLYPH_WIDTH);
const TYPING_SECONDS = 1.6;

const COLORS = {
  background: "#0d1117",
  border: "#30363d",
  text: "#e6edf3",
  dim: "#8b949e",
  accent: "#d97757",
  ok: "#3fb950",
};

/**
 * Renders the whole terminal as an SVG document.
 *
 * @example
 * const svg = renderTerminal(profile, { login: "octocat", question: "what is octocat shipping?", now: Date.now() });
 *
 * @param {Profile} profile
 * @param {{ login: string, question: string, now: number }} options
 * @returns {string}
 */
export function renderTerminal(profile, { login, question, now }) {
  const repos = listedRepos(profile, login);
  const lines = terminalLines(repos, profile.contributionsCollection, { login, now });
  const cursorY = TOP + (lines.length + 1) * LINE_HEIGHT;
  const height = cursorY + 56;
  const label = `Terminal: ${question} Recent projects: ${repos
    .slice(0, LISTED_REPOS)
    .map((repo) => repo.name)
    .join(", ")}.`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeXml(label)}">
  ${styles(question)}
  ${windowFrame(login, height)}
  ${promptLine(question)}
  ${lines.map(placeLine).join("\n  ")}
  ${cursorLine(cursorY, revealDelay(lines.length))}
  ${footer(height, now)}
</svg>
`;
}

// Only repos with a description are showcase material; the profile repo is this one.
/** @param {Profile} profile @param {string} login @returns {Repo[]} */
export function listedRepos(profile, login) {
  return profile.repositories.nodes.filter(
    (repo) => repo.description && !repo.isArchived && repo.name !== login,
  );
}

/** @param {string} pushedAt ISO-8601 @param {number} now @returns {string} */
export function timeSince(pushedAt, now) {
  const days = Math.floor((now - Date.parse(pushedAt)) / DAY_MS);
  if (days < 1) return "today";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** @param {string} text @param {number} maxChars @returns {string} */
export function truncate(text, maxChars) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

/** @param {string} text @returns {string} */
export function escapeXml(text) {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Each entry is one terminal line; null leaves a blank line.
/**
 * @param {Repo[]} repos
 * @param {Activity} activity
 * @param {{ login: string, now: number }} options
 * @returns {(string[] | null)[]}
 */
function terminalLines(repos, activity, { login, now }) {
  const recent = repos.filter((repo) => now - Date.parse(repo.pushedAt) <= 30 * DAY_MS);
  return [
    null,
    heading(`Querying the GitHub GraphQL API for @${login}`),
    detail(`${recent.length} public projects pushed in the last 30 days`, COLORS.dim),
    null,
    heading("Most recent pushes"),
    ...repos.slice(0, LISTED_REPOS).flatMap((repo) => repoLines(repo, now)),
    null,
    heading("Last 12 months"),
    detail(activitySummary(activity)),
    null,
  ];
}

/** @param {Repo} repo @param {number} now @returns {string[][]} */
function repoLines(repo, now) {
  return [
    [
      svgText(LEFT + 20, "⎿", COLORS.dim),
      svgText(COLUMNS.name - 22, "●", repo.primaryLanguage?.color ?? COLORS.dim),
      svgText(COLUMNS.name, escapeXml(repo.name), COLORS.text, ` font-weight="600"`),
      svgText(COLUMNS.language, escapeXml(repo.primaryLanguage?.name ?? "—"), COLORS.dim),
      svgText(COLUMNS.pushed, timeSince(repo.pushedAt, now), COLORS.ok),
    ],
    [svgText(COLUMNS.name, escapeXml(truncate(repo.description ?? "", DESCRIPTION_CHARS)), COLORS.dim)],
  ];
}

/** @param {Activity} activity @returns {string} */
export function activitySummary(activity) {
  return [
    `${activity.contributionCalendar.totalContributions} contributions`,
    `${activity.totalCommitContributions} public commits`,
    `${activity.totalPullRequestContributions} pull requests`,
    `${activity.restrictedContributionsCount} in private repos`,
  ].join(" · ");
}

/** @param {string} content @returns {string[]} */
function heading(content) {
  return [svgText(LEFT, "●", COLORS.accent), svgText(LEFT + 20, content)];
}

/** @param {string} content @param {string} [fill] @returns {string[]} */
function detail(content, fill = COLORS.text) {
  return [svgText(LEFT + 20, "⎿", COLORS.dim), svgText(LEFT + 40, content, fill)];
}

/** @param {number} x @param {string} content @param {string} [fill] @param {string} [attributes] @returns {string} */
function svgText(x, content, fill = COLORS.text, attributes = "") {
  return `<text x="${x}" fill="${fill}"${attributes}>${content}</text>`;
}

/** @param {number} lineIndex @returns {string} seconds until the line fades in, after the typing ends */
function revealDelay(lineIndex) {
  return (TYPING_SECONDS + 0.25 + lineIndex * 0.12).toFixed(2);
}

// The CSS animation sets `transform`, which would override the translate on the same element,
// so the position and the animation live on two nested groups.
/** @param {string[] | null} parts @param {number} index @returns {string} */
function placeLine(parts, index) {
  if (!parts) return "";
  const y = TOP + (index + 1) * LINE_HEIGHT;
  return `<g transform="translate(0 ${y})"><g class="line" style="animation-delay:${revealDelay(index)}s">${parts.join("")}</g></g>`;
}

/** @param {string} question @returns {string} */
function styles(question) {
  return `<style>
    text { font: 14px ui-monospace, SFMono-Regular, "Cascadia Code", Menlo, Consolas, monospace; white-space: pre; dominant-baseline: middle; }
    .line { opacity: 0; animation: show 0.3s ease-out forwards; }
    .typing { animation: type ${TYPING_SECONDS}s steps(${question.length}) 0.4s forwards; }
    .cursor { animation: blink 1s steps(1) infinite; }
    @keyframes show { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; } }
    @keyframes type { to { transform: translateX(${question.length * GLYPH_WIDTH}px); } }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .line { animation: none; opacity: 1; }
      .typing { display: none; }
      .cursor { animation: none; }
    }
  </style>`;
}

/** @param {string} login @param {number} height @returns {string} */
function windowFrame(login, height) {
  return `<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="10" fill="${COLORS.background}" stroke="${COLORS.border}"/>
  <circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>
  <g transform="translate(0 20)">${svgText(WIDTH / 2, `~/${escapeXml(login)}`, COLORS.dim, ` text-anchor="middle"`)}</g>
  <line x1="0" y1="40" x2="${WIDTH}" y2="40" stroke="${COLORS.border}"/>`;
}

// A background-colored rect slides off the question to make it look typed.
/** @param {string} question @returns {string} */
function promptLine(question) {
  const width = question.length * GLYPH_WIDTH;
  return `<g transform="translate(0 ${TOP})">
    ${svgText(LEFT, "&gt;", COLORS.accent)}${svgText(LEFT + 20, escapeXml(question))}
    <rect class="typing" x="${LEFT + 20}" y="-12" width="${width + 4}" height="24" fill="${COLORS.background}"/>
  </g>`;
}

/** @param {number} y @param {string} delay @returns {string} */
function cursorLine(y, delay) {
  return `<g transform="translate(0 ${y})"><g class="line" style="animation-delay:${delay}s">
    ${svgText(LEFT, "&gt;", COLORS.accent)}<rect class="cursor" x="${LEFT + 20}" y="-9" width="9" height="18" fill="${COLORS.text}"/>
  </g></g>`;
}

/** @param {number} height @param {number} now @returns {string} */
function footer(height, now) {
  const redrawnOn = new Date(now).toISOString().slice(0, 10);
  return `<g transform="translate(0 ${height - 20})">${svgText(WIDTH - LEFT, `redrawn daily by GitHub Actions · ${redrawnOn}`, COLORS.dim, ` text-anchor="end" font-size="12"`)}</g>`;
}
