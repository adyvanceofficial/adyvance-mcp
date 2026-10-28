#!/usr/bin/env node
// adyvance-mcp: a tiny stdio ↔ HTTP bridge for AI apps that can only start local MCP servers
// (for example Claude Desktop with a config file). It forwards each JSON-RPC message from stdin to
// your shop's remote MCP server with your Adyvance API key, and writes the answers to stdout.
//
// No dependencies. Node.js 18 or newer.
//
//   ADYVANCE_MCP_URL  the server address shown in Adyvance → Apps → Developer → MCP server
//   ADYVANCE_API_KEY  an API key made there (ady_live_… or ady_test_…)
//
// Everything the bridge prints for people goes to stderr; stdout carries only MCP messages.

import { createInterface } from "node:readline";

const VERSION = "1.0.0";
const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${VERSION}\n`);
  process.exit(0);
}
if (args.includes("--help") || args.includes("-h")) {
  process.stderr.write(
    [
      "adyvance-mcp: connect a local MCP client to your Adyvance shop.",
      "",
      "Environment:",
      "  ADYVANCE_MCP_URL   e.g. https://mcp.adyvance.com/mcp",
      "  ADYVANCE_API_KEY   an API key from Apps → Developer",
      "",
      "Options:",
      "  --url <address>    instead of ADYVANCE_MCP_URL",
      "  --version          print the version",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = flag("--url") ?? process.env.ADYVANCE_MCP_URL;
const key = process.env.ADYVANCE_API_KEY;
const log = (msg) => process.stderr.write(`[adyvance-mcp] ${msg}\n`);

if (!url || !/^https?:\/\//.test(url)) {
  log("Set ADYVANCE_MCP_URL to the server address from Adyvance → Apps → Developer.");
  process.exit(1);
}
if (!key || !/^ady_(live|test)_[a-z2-7]{32}$/.test(key)) {
  log("Set ADYVANCE_API_KEY to an Adyvance API key (ady_live_… or ady_test_…).");
  process.exit(1);
}
if (url.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
  log("Use an https address (http is only for localhost).");
  process.exit(1);
}

let protocolVersion = null;
let sessionId = null;
let pending = 0;
let closing = false;

const write = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);

/** JSON-RPC errors for every request (not notification) in a message. */
function failAll(message, code, text) {
  for (const m of Array.isArray(message) ? message : [message]) {
    if (m && typeof m === "object" && "method" in m && m.id !== undefined && m.id !== null) {
      write({ jsonrpc: "2.0", id: m.id, error: { code, message: text } });
    }
  }
}

/** Server-sent events (if a server ever streams): one MCP message per `data:` block. */
function readSse(body) {
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (data) {
      try {
        emit(JSON.parse(data));
      } catch {
        log("The server sent an event that is not JSON; skipped.");
      }
    }
  }
}

function emit(answer) {
  for (const a of Array.isArray(answer) ? answer : [answer]) {
    if (a?.result?.protocolVersion && !protocolVersion) protocolVersion = a.result.protocolVersion;
    write(a);
  }
}

async function forward(message) {
  pending++;
  try {
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${key}`,
      "user-agent": `adyvance-mcp/${VERSION}`,
    };
    if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
    if (sessionId) headers["mcp-session-id"] = sessionId;
    let res;
    try {
      res = await fetch(url, { method: "POST", headers, body: JSON.stringify(message) });
    } catch (e) {
      log(`Could not reach ${url}: ${e.message}`);
      failAll(message, -32000, "Could not reach the Adyvance MCP server. Check the address and your connection.");
      return;
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) sessionId = sid;
    if (res.status === 202 || res.status === 204) return;
    if (res.status === 401) {
      log("The API key was refused (wrong, revoked, expired, or not allowed from this IP).");
      failAll(message, -32001, "Adyvance refused the API key. Make a new key in Apps → Developer.");
      return;
    }
    const text = await res.text();
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/event-stream")) return readSse(text);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      log(`Unexpected answer (HTTP ${res.status}).`);
      failAll(message, -32000, `The Adyvance MCP server answered HTTP ${res.status}.`);
      return;
    }
    if (body && (body.jsonrpc || Array.isArray(body))) emit(body);
    else failAll(message, -32000, body?.error_description ?? `HTTP ${res.status}`);
  } finally {
    pending--;
    if (closing && pending === 0) process.exit(0);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  void forward(message);
});
rl.on("close", () => {
  closing = true;
  if (pending === 0) process.exit(0);
});
