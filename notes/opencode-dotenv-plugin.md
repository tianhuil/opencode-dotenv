# OpenCode DotEnv Plugin

**Date:** 2026-02-22  
**Topic:** Building an OpenCode plugin to load `.env` files into shell environments  
**Source:** https://opencode.ai/docs/plugins/

---

## Executive Summary

- OpenCode has a built-in plugin system with a `shell.env` hook specifically designed for injecting environment variables into shells
- The plugin automatically loads before every shell execution (both AI-triggered bash commands and interactive terminals)
- Implementation is straightforward - just a few lines of JavaScript/TypeScript

---

## How Plugins Work

### Plugin Locations

Plugins are automatically loaded from these directories at startup:

| Location | Scope |
|----------|-------|
| `.opencode/plugins/` | Project-level (only this project) |
| `~/.config/opencode/plugins/` | Global (all projects) |

Both `.js` and `.ts` files are supported.

### Plugin Structure

A plugin is a JavaScript/TypeScript module that exports one or more plugin functions:

```ts
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    // Hook implementations go here
  }
}
```

**Context parameters:**
- `project` - The current project information
- `directory` - The current working directory
- `worktree` - The git worktree path
- `client` - An OpenCode SDK client for interacting with the AI
- `$` - Bun's shell API for executing commands

### Load Order

Plugins load in this sequence:
1. Global config (`~/.config/opencode/opencode.json`)
2. Project config (`opencode.json`)
3. Global plugin directory (`~/.config/opencode/plugins/`)
4. Project plugin directory (`.opencode/plugins/`)

---

## The `shell.env` Hook

The `shell.env` event fires **before every shell execution**, including:
- AI-triggered bash commands
- User's interactive terminal inside OpenCode

### Hook Signature

```ts
"shell.env": async (input, output) => {
  // input.cwd - current working directory
  // output.env - environment object to inject into shells
}
```

### Official Example

From the documentation:

```js
export const InjectEnvPlugin = async () => {
  return {
    "shell.env": async (input, output) => {
      output.env.MY_API_KEY = "secret"
      output.env.PROJECT_ROOT = input.cwd
    },
  }
}
```

---

## Implementation: Load DotEnv Plugin

### File Location

```
.opencode/plugins/load-dotenv.js
```

### Complete Implementation

```js
import { readFileSync } from "fs"
import { join } from "path"

export const LoadDotEnv = async ({ directory }) => {
  return {
    "shell.env": async (input, output) => {
      const envPath = join(input.cwd ?? directory, ".env")
      try {
        const contents = readFileSync(envPath, "utf8")
        for (const line of contents.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith("#")) continue
          const eq = trimmed.indexOf("=")
          if (eq === -1) continue
          const key = trimmed.slice(0, eq).trim()
          let val = trimmed.slice(eq + 1).trim()
          // Strip surrounding quotes
          if ((val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          output.env[key] = val
        }
      } catch {
        // No .env file found — that's fine
      }
    },
  }
}
```

### TypeScript Version

```ts
import { readFileSync } from "fs"
import { join } from "path"
import type { Plugin } from "@opencode-ai/plugin"

export const LoadDotEnv: Plugin = async ({ directory }) => {
  return {
    "shell.env": async (input, output) => {
      const envPath = join(input.cwd ?? directory, ".env")
      try {
        const contents = readFileSync(envPath, "utf8")
        for (const line of contents.split("\n")) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith("#")) continue
          const eq = trimmed.indexOf("=")
          if (eq === -1) continue
          const key = trimmed.slice(0, eq).trim()
          let val = trimmed.slice(eq + 1).trim()
          // Strip surrounding quotes
          if ((val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          output.env[key] = val
        }
      } catch {
        // No .env file found — that's fine
      }
    },
  }
}
```

---

## Key Design Decisions

### 1. Path Resolution

```js
const envPath = join(input.cwd ?? directory, ".env")
```

- Uses `input.cwd` if available (current working directory of the shell)
- Falls back to `directory` from plugin context
- This ensures the correct `.env` file is loaded based on where the shell is running

### 2. Error Handling

```js
try {
  // ...
} catch {
  // No .env file found — that's fine
}
```

- Silently ignores missing `.env` files
- Non-blocking: if no `.env` exists, shells still work normally

### 3. Quote Stripping

```js
if ((val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))) {
  val = val.slice(1, -1)
}
```

- Handles both single and double quoted values
- Standard `.env` format support

### 4. Comment & Empty Line Handling

```js
if (!trimmed || trimmed.startsWith("#")) continue
```

- Skips empty lines
- Skips comment lines (starting with `#`)

---

## Why This Plugin Is Needed

OpenCode has a built-in `.env` loader, but it only loads environment variables for:
- Provider API keys (OpenAI, Anthropic, etc.)
- OpenCode's own configuration

**It does NOT make these variables available inside the shells it spawns.** This plugin bridges that gap.

---

## Extensions

### Loading Multiple Files

To load from `.env`, `.env.local`, `.env.development`, etc.:

```js
export const LoadDotEnv = async ({ directory }) => {
  return {
    "shell.env": async (input, output) => {
      const basePath = input.cwd ?? directory
      const files = [".env.local", ".env.development", ".env"]
      
      for (const file of files) {
        const envPath = join(basePath, file)
        try {
          const contents = readFileSync(envPath, "utf8")
          // ... parse and set output.env[key] = val
        } catch {
          // Skip missing files
        }
      }
    },
  }
}
```

### Using External Dependencies

If you need to use an npm package like `dotenv`:

1. Create `.opencode/package.json`:

```json
{
  "dependencies": {
    "dotenv": "^16.0.0"
  }
}
```

2. OpenCode runs `bun install` at startup automatically.

3. Use in plugin:

```js
import { config } from "dotenv"
import { join } from "path"

export const LoadDotEnv = async ({ directory }) => {
  return {
    "shell.env": async (input, output) => {
      const basePath = input.cwd ?? directory
      const result = config({ path: join(basePath, ".env") })
      if (result.parsed) {
        Object.assign(output.env, result.parsed)
      }
    },
  }
}
```

---

## Alternative Approaches

### Option 1: Simple Fixed Variables

If you only need to inject a few fixed variables:

```js
export const InjectEnvPlugin = async () => {
  return {
    "shell.env": async (input, output) => {
      output.env.MY_API_KEY = "secret"
      output.env.PROJECT_ROOT = input.cwd
    },
  }
}
```

**Pros:** Simple, no file I/O  
**Cons:** Hardcoded, not flexible

### Option 2: Full DotEnv Plugin (Recommended)

As shown above - reads from `.env` file.

**Pros:** Flexible, follows standard `.env` format  
**Cons:** Slight overhead of file reading

### Option 3: Using npm `dotenv` Package

**Pros:** Handles all edge cases (multiline values, escaping, etc.)  
**Cons:** Requires dependency, slightly more complex setup

---

## Testing the Plugin

1. Create the plugin file at `.opencode/plugins/load-dotenv.js`
2. Create a `.env` file in your project:

```env
MY_SECRET=supersecret
API_KEY=abc123
```

3. Start OpenCode
4. Run a shell command and verify:

```bash
echo $MY_SECRET
# Should output: supersecret
```

---

## Related Events

The plugin system supports many other events:

| Event | Purpose |
|-------|---------|
| `shell.env` | Inject env vars into shells |
| `tool.execute.before` | Intercept tool calls before execution |
| `tool.execute.after` | Post-process tool results |
| `session.idle` | React to session completion |
| `file.edited` | React to file changes |
| `tui.toast.show` | Show notifications in TUI |

---

## References

- [OpenCode Plugins Documentation](https://opencode.ai/docs/plugins/)
- [OpenCode SDK Documentation](https://opencode.ai/docs/sdk/)
- [OpenCode Ecosystem - Community Plugins](https://opencode.ai/docs/ecosystem#plugins)
