// Renders assets/terminal.svg: a terminal session where an agent answers
// "what is natan shipping?" with live data from the GitHub GraphQL API.
// Runs daily from .github/workflows/refresh-terminal.yml. No dependencies.

import { mkdir, writeFile } from "node:fs/promises";

import { fetchProfile } from "./github-profile.mjs";
import { renderTerminal } from "./terminal-svg.mjs";

const LOGIN = process.env.GITHUB_LOGIN ?? "natansalvadorligabo";
const QUESTION = "what is natan shipping these days?";
const OUTPUT = new URL("../assets/terminal.svg", import.meta.url);

const now = Date.now();
const profile = await fetchProfile({ login: LOGIN, token: process.env.GITHUB_TOKEN, now, fetch });
await mkdir(new URL("../assets/", import.meta.url), { recursive: true });
await writeFile(OUTPUT, renderTerminal(profile, { login: LOGIN, question: QUESTION, now }));
console.log(`wrote ${OUTPUT.pathname}`);
