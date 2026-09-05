#!/usr/bin/env node
/**
 * Lightweight secret scanner.
 *
 * Scans the tracked-style source tree (excluding dependencies and build output)
 * for high-confidence secret material whose accidental commit would be a leak.
 *
 * Exit codes:
 *   0 — no secrets found
 *   1 — at least one finding, listed below
 *   2 — usage/scan error
 *
 * This is a guard-rail, not a substitute for review: keep real values in your
 * local `.env.local` (git-ignored) and only placeholders in `.env.example`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".vercel",
]);
const SKIP_FILES = new Set(["pnpm-lock.yaml", "package-lock.json"]);
const MAX_BYTES = 500 * 1024; // skip huge / binary files
const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".css",
  ".html",
  ".env",
  ".env.example",
]);

const PATTERNS = [
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "AWS secret access key", re: /aws_secret_access_key\s*=\s*["'][^"']+["']/i },
  {
    name: "PEM/DSA/EC/OpenSSH private key",
    re: /-----BEGIN (?:RSA |EC |DSA |PGP |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Stripe live key", re: /\bsk_live_[0-9A-Za-z]{10,}\b/ },
  { name: "Slack token", re: /\bxox[bpoa]-[0-9A-Za-z-]{10,}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full);
      continue;
    }
    if (SKIP_FILES.has(entry.name)) continue;
    const stat = statSync(full);
    if (stat.size > MAX_BYTES) continue;
    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    if (!TEXT_EXT.has(ext) && entry.name !== ".env.example") continue;
    scanFile(full);
  }
}

const findings = [];

function scanFile(file) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const { name, re } of PATTERNS) {
    const match = content.match(re);
    if (match) {
      findings.push(`[${name}] ${relative(process.cwd(), file)}`);
      return; // one finding per file is enough
    }
  }
}

try {
  walk(process.cwd());
} catch (error) {
  console.error(`check-secrets: scan error: ${error.message}`);
  process.exit(2);
}

if (findings.length > 0) {
  console.error("Potential secrets found — do not commit these files:\n");
  for (const finding of findings) console.error(`  • ${finding}`);
  console.error("\nMove real values to your git-ignored .env.local and use .env.example placeholders.");
  process.exit(1);
}

console.log("check-secrets: no high-confidence secrets found.");
