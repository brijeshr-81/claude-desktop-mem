import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import path from "path";

const VAULT_PATH = "/Users/charanbrijesh/knowledge-base";

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isoNow() {
  return new Date().toISOString();
}

function timestampPrefix() {
  // YYYYMMDD-HHmmss
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
}

/** Recursively collect all .md file paths under a directory */
function collectMarkdownFiles(dir, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectMarkdownFiles(full, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

// ── Tool implementations ──────────────────────────────────────────────────────

function storeMemory({ title, content, type }) {
  if (!title || typeof title !== "string" || title.trim() === "") {
    throw new Error("'title' is required and must be a non-empty string.");
  }
  if (!content || typeof content !== "string" || content.trim() === "") {
    throw new Error("'content' is required and must be a non-empty string.");
  }
  if (!type || typeof type !== "string" || type.trim() === "") {
    throw new Error("'type' is required and must be a non-empty string.");
  }

  const safeType = slugify(type) || "general";
  const folderPath = path.join(VAULT_PATH, safeType);
  fs.mkdirSync(folderPath, { recursive: true });

  const ts = isoNow();
  const prefix = timestampPrefix();
  const slug = slugify(title) || "untitled";
  const filename = `${prefix}-${slug}.md`;
  const filePath = path.join(folderPath, filename);

  const frontmatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `type: "${safeType}"`,
    `created_at: "${ts}"`,
    "---",
    "",
  ].join("\n");

  fs.writeFileSync(filePath, frontmatter + content, "utf8");

  return {
    stored: true,
    path: filePath,
    filename,
    created_at: ts,
  };
}

function searchMemory({ query }) {
  if (!query || typeof query !== "string" || query.trim() === "") {
    throw new Error("'query' is required and must be a non-empty string.");
  }

  const needle = query.toLowerCase();
  const files = collectMarkdownFiles(VAULT_PATH);
  const matches = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
    if (text.toLowerCase().includes(needle)) {
      // Extract title from frontmatter if present
      const titleMatch = text.match(/^title:\s*"?(.+?)"?\s*$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(filePath, ".md");

      // Grab a short excerpt around first occurrence
      const idx = text.toLowerCase().indexOf(needle);
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + query.length + 80);
      const excerpt = text.slice(start, end).replace(/\n+/g, " ").trim();

      matches.push({
        path: filePath,
        relative: path.relative(VAULT_PATH, filePath),
        title,
        excerpt: `...${excerpt}...`,
      });
    }
  }

  return {
    query,
    total: matches.length,
    results: matches,
  };
}

// ── Tool schema definitions ───────────────────────────────────────────────────

const TOOLS = [
  {
    name: "store_memory",
    description:
      "Persist a piece of information as a structured markdown file inside the Obsidian vault. Use this to save knowledge, decisions, facts, or any information Claude should remember long-term.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short, descriptive title for this memory.",
        },
        content: {
          type: "string",
          description: "Full markdown content to store.",
        },
        type: {
          type: "string",
          description:
            'Category folder (e.g. "skills", "execution", "design", "people", "decisions").',
        },
      },
      required: ["title", "content", "type"],
      additionalProperties: false,
    },
  },
  {
    name: "search_memory",
    description:
      "Search all markdown files in the Obsidian vault for a keyword or phrase. Returns matching file paths and excerpts.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keyword or phrase to search for (case-insensitive).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "claude-memory-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    if (name === "store_memory") {
      result = storeMemory(args);
    } else if (name === "search_memory") {
      result = searchMemory(args);
    } else {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Unknown tool: "${name}"`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
