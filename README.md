# Claude Memory MCP

An MCP server for persistent memory storage. Saves and searches information in an Obsidian vault as markdown files.

## Quick Start

```bash
npm install
npm start
```

## Tools

### store_memory
Save a memory to the vault.

```
title (string): Memory title
content (string): Markdown content
type (string): Category folder (e.g., "skills", "decisions")
```

### search_memory
Search all vault files for a keyword.

```
query (string): Keyword to search for
```

## How It Works

- Memories are stored as timestamped markdown files: `20260416-103045-my-title.md`
- Files are organized in folders by type
- Each file includes frontmatter with title, type, and creation date
- Full-text search works across all files recursively

## Configuration

Vault path is set in `server.js`:
```javascript
const VAULT_PATH = "/Users/charanbrijesh/knowledge-base";
```

## Requirements

- Node.js 18+
- `@modelcontextprotocol/sdk`
