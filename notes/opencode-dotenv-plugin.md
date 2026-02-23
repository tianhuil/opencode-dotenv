# OpenCode DotEnv Plugin

**Date:** 2026-02-22  
**Topic:** Building an OpenCode plugin to load `.env` files into shell environments  
**Source:** https://opencode.ai/docs/plugins/

---

## Executive Summary

- OpenCode has a built-in plugin system with a `shell.env` hook specifically designed for injecting environment variables into shells
- The plugin automatically loads before every shell execution (both AI-triggered bash commands and interactive terminals)
- **Uses [dotenvx](https://dotenvx.com/) for robust `.env` file parsing with encryption support**
- **Follows the [dotenv-flow convention](https://dotenvx.com/docs/advanced/config-convention#flow-convention) for multi-environment support**

---

## Why Dotenvx?

[Dotenvx](https://dotenvx.com/) is the next-generation dotenv from the creator of the original `dotenv` package. Key benefits:

| Feature | Description |
|---------|-------------|
| **Encrypted envs** | Encrypt secrets in `.env` files - safe to commit to git |
| **Multi-environment** | Built-in support for `.env.development`, `.env.production`, etc. |
| **Flow convention** | Follows dotenv-flow file loading order |
| **Cross-platform** | Works in Node.js, Bun, Python, Go, Ruby, PHP, and more |
| **Variable expansion** | Reference other variables: `DATABASE_URL=postgres://${USER}@localhost` |
| **Command substitution** | Use shell commands: `HOSTNAME=$(hostname)` |

---

## How Plugins Work

### Plugin Locations

Plugins are automatically loaded from these directories at startup:

| Location | Scope |
|----------|-------|
| `.opencode/plugins/` | Project-level (only this project) |
| `~/.config/opencode/plugins/` | Global (all projects) |

Both `.js` and `.ts` files are supported, but TypeScript is recommended for type safety.

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

```ts
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

## Implementation: Dotenvx Plugin (Recommended)

### Project Structure with Shim Pattern

For this repository, we use a **shim pattern** where:

- **Source code** lives in `src/` for development and testing
- **Shim file** in `.opencode/plugins/` imports from `src/`

This separation allows:
- ✅ Development with TypeScript
- ✅ Unit/integration testing with test suites
- ✅ Type safety and editor support
- ✅ Easy testing without OpenCode

```
opencode-dotenv/
├── src/
│   └── load-dotenv.ts          # Main implementation (TypeScript)
├── .opencode/
│   ├── package.json             # Dependencies for shim
│   └── plugins/
│       └── load-dotenv.ts      # Shim (imports from src)
├── package.json                 # Root dependencies
├── test-plugin.ts               # Test suite
└── notes/
    └── opencode-dotenv-plugin.md # This documentation
```

### Prerequisites

Create `.opencode/package.json` to install dotenvx:

```json
{
  "dependencies": {
    "@dotenvx/dotenvx": "^1.48.0"
  }
}
```

OpenCode runs `bun install` at startup automatically.

### Main Implementation (src/load-dotenv.ts)

### Prerequisites

Create `.opencode/package.json` to install dotenvx:

```json
{
  "dependencies": {
    "@dotenvx/dotenvx": "^1.48.0"
  }
}
```

OpenCode runs `bun install` at startup automatically.

### File Location

```
.opencode/plugins/load-dotenv.ts
```

### Complete Implementation

```ts
import { config } from "@dotenvx/dotenvx"
import { join } from "path"
import type { Plugin } from "@opencode-ai/plugin"

export const LoadDotEnv: Plugin = async ({ directory }) => {
  return {
    "shell.env": async (input, output) => {
      const basePath = input.cwd ?? directory
      
      // Use a custom processEnv object to capture parsed values
      const processEnv = {}
      
      // Default NODE_ENV to 'development' if not set
      const nodeEnv = process.env.NODE_ENV || "development"
      
      // Load env files using dotenv-flow convention
      const result = config({
        path: basePath,
        convention: "flow",
        processEnv,
        quiet: true,        // Suppress console output
        ignore: ["MISSING_ENV_FILE"],  // Don't error if files missing
      })
      
      // Merge parsed values into output.env (don't override existing)
      if (result.parsed) {
        for (const [key, value] of Object.entries(result.parsed)) {
          if (!(key in output.env)) {
            output.env[key] = value
          }
        }
      }
      
      // Also set NODE_ENV in the shell if it wasn't already set
      if (!("NODE_ENV" in output.env)) {
        output.env.NODE_ENV = nodeEnv
      }
    },
  }
}
```

### Shim File (.opencode/plugins/load-dotenv.ts)

OpenCode loads this shim file, which re-exports the plugin from `src/`:

```ts
// OpenCode Plugin Shim
// This file is loaded by OpenCode and re-exports the plugin from src/

export { LoadDotEnv as LoadDotEnvPlugin } from "../../src/load-dotenv"
```

**Note:** The shim re-exports from the TypeScript file `src/load-dotenv.ts`. Bun automatically handles `.ts` files.

---

## Testing Strategy

### Overview

Two complementary test approaches ensure plugin reliability:

1. **Unit Tests** - Test core dotenvx loading logic in isolation
2. **E2E Tests** - Test full OpenCode plugin integration

### Unit Tests

#### Architecture

**Refactor Required:** Extract core dotenvx loading logic into a testable function:

```ts
// Current (in shell.env hook):
"shell.env": async (input, output) => {
  // All logic here...
}

// Proposed:
async function loadDotEnvFiles(
  basePath: string,
  options: LoadDotEnvOptions
): Promise<Record<string, string>> {
  // Pure dotenvx loading logic
  // Returns: { key1: "value1", key2: "value2", ... }
}

"shell.env": async (input, output) => {
  const loaded = await loadDotEnvFiles(input.cwd, options)
  Object.assign(output.env, loaded)
}
```

**Benefits:** Fast iteration, easy debugging, comprehensive edge case coverage, controlled environment.

#### Mock Test Directory

Create `test/fixtures/env-loading/` with committed test files:

```
test/fixtures/
├── env-loading/
│   ├── .env                      # Global defaults (committed)
│   ├── .env.development          # Development overrides (committed)
│   ├── .env.development.local    # Dev local (gitignored)
│   ├── .env.local                # Local overrides (gitignored)
│   ├── .env.production           # Production defaults (committed)
│   └── .env.test                 # Test defaults (committed)
└── encrypted-env/
    ├── .env                      # Encrypted values (committed)
    └── .env.keys                 # Test keys (committed - safe, not real secrets)
```

**Test .env content:**
```env
APP_NAME=TestApp
DATABASE_HOST=localhost
DATABASE_PORT=5432
LOG_LEVEL=info
```

**Note:** `.env.keys` in `test/fixtures/encrypted-env/` can be committed because it contains test encryption keys (not real secrets). Project root `.env.keys` should still be gitignored.

#### Test Scenarios

| # | Scenario | Description |
|---|----------|-------------|
| 1 | Basic Loading | Load `.env` only, verify all variables |
| 2 | Flow Convention (dev) | `NODE_ENV=development`, verify loading order |
| 3 | Flow Convention (prod) | `NODE_ENV=production`, verify prod vars |
| 4 | Flow Convention (test) | `NODE_ENV=test`, verify test vars |
| 5 | Missing Files | Load from empty dir, verify no errors |
| 6 | Variable Expansion | Test `${VAR}` substitution |
| 7 | Encryption/Decryption | Load encrypted values with key |
| 8 | Non-Overriding Merge | Existing vars not overridden |
| 9 | Overriding Mode | `.env` values override when enabled |
| 10 | Multi-Path | Load from multiple directories |

#### Test Implementation

```ts
// test/load-dotenv.test.ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { loadDotEnvFiles } from "../src/load-dotenv"
import { tmpdir } from "os"
import { join } from "path"

describe("loadDotEnvFiles", () => {
  let testDir: string

  beforeEach(async () => {
    testDir = join(tmpdir(), `dotenv-test-${Date.now()}`)
    await createTestDirectory(testDir)
  })

  afterEach(async () => {
    await removeDirectory(testDir)
  })

  test("loads .env file", async () => {
    const result = await loadDotEnvFiles(testDir)
    expect(result.APP_NAME).toBe("TestApp")
    expect(result.DATABASE_HOST).toBe("localhost")
  })

  test("respects flow convention with NODE_ENV=development", async () => {
    const result = await loadDotEnvFiles(testDir, { nodeEnv: "development" })
    expect(result.DEBUG).toBe("true")
    expect(result.APP_NAME).toBe("TestApp (Development)")
  })
})
```

### E2E Tests

#### CLI Test

**Purpose:** Verify the plugin works end-to-end by running OpenCode CLI and requesting environment variables.

**Test Structure:**

```ts
// test/e2e-cli.test.ts
import { test, expect, describe, beforeEach } from "bun:test"
import { $ } from "bun"

describe("E2E: OpenCode CLI", () => {
  beforeEach(() => {
    // Ensure test environment variables are set
    process.env.NODE_ENV = "test"
  })

  test("loads environment variable and makes it available to OpenCode", async () => {
    // Generate random string for unique test
    const randomString = `test-value-${Date.now()}-${Math.random().toString(36).slice(2)}`
    
    // Create temporary .env file with test variable
    await $`echo "TEST_VAR=${randomString}" > .env.test`
    
    try {
      // Run OpenCode CLI asking for the environment variable
      // The plugin should load .env.test and inject TEST_VAR
      const result = await $`opencode run 'print the value of TEST_VAR environment variable'`
      
      // Verify the output contains our random string
      expect(result.stdout).toContain(randomString)
      expect(result.exitCode).toBe(0)
    } finally {
      // Cleanup test file
      await $`rm -f .env.test`
    }
  })
})
```

**Test Execution:**

```bash
# Run the CLI integration tests
bun test test/e2e-cli.test.ts

# Run all tests
bun test
```

**Test Command Breakdown:**

```ts
// The command flow:
// 1. opencode run 'print the value of TEST_VAR environment variable'
//    ↓
// 2. OpenCode loads the plugin
//    ↓
// 3. Plugin calls shell.env hook before executing bash
//    ↓
// 4. Plugin loads .env.test (via dotenvx with flow convention)
//    ↓
// 5. Plugin injects TEST_VAR into bash environment
//    ↓
// 6. OpenCode asks AI to print TEST_VAR
//    ↓
// 7. AI uses bash tool to echo $TEST_VAR
//    ↓
// 8. Bash returns the value (our random string)
//    ↓
// 9. AI includes it in response
//    ↓
// 10. Test verifies output contains random string
```

**Advantages of CLI Test:**

- ✅ **Real OpenCode execution** - Tests actual CLI behavior
- ✅ **No test utilities needed** - Uses Bun's built-in `$` shell
- ✅ **End-to-end verification** - Tests full plugin → bash → AI pipeline
- ✅ **Simple and maintainable** - Straightforward test logic
- ✅ **Isolated** - Uses temporary `.env.test` files, no side effects

**Notes:**

- Tests use `opencode run` which executes a single prompt
- Random strings ensure tests don't accidentally pass due to cached values
- Cleanup with `try/finally` to remove test files
- `NODE_ENV=test` is set to match test environment convention
- Tests verify both `stdout` content and `exitCode` (success status)

#### Additional Test Scenarios

| # | Scenario | Description |
|---|----------|-------------|
| 1 | Basic CLI Test | ✅ `opencode run` with env variable (above) |
| 2 | Multiple Vars | ✅ Load multiple env vars simultaneously |
| 3 | Flow Convention | ✅ Respect NODE_ENV for env selection |
| 4 | Encrypted Vars | Load encrypted values, verify decryption |
| 5 | Missing Files | Graceful handling when .env missing |
| 6 | Interactive Mode | Test in interactive terminal (manual) |

### Test Execution

**Phase 1: Refactor**
1. Extract `loadDotEnvFiles()` function
2. Update shim to use extracted function
3. Verify existing functionality

**Phase 2: Unit Tests**
1. Create `test/fixtures/` structure
2. Add test `.env` files
3. Implement `load-dotenv.test.ts`
4. Run: `bun test test/load-dotenv.test.ts`

**Phase 3: E2E Tests**
1. Implement `test/e2e-cli.test.ts`
2. Ensure OpenCode CLI is installed and in PATH
3. Run: `bun test test/e2e-cli.test.ts`

### Test Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test test/load-dotenv.test.ts",
    "test:e2e": "bun test test/e2e-cli.test.ts"
  }
}
```

### Coverage Goals

- **Core Logic**: 100% coverage of `loadDotEnvFiles()`
- **Flow Convention**: All environment types
- **Error Handling**: Edge cases and error paths
- **Encryption**: Encryption/decryption paths
- **Integration**: Critical E2E workflows

---

## Dotenvx Flow Convention

### File Loading Order

When using `convention: "flow"`, dotenvx loads files in this order (first wins):

| Priority | File | Description |
|----------|------|-------------|
| 1 (highest) | `.env.{NODE_ENV}.local` | Environment-specific local overrides |
| 2 | `.env.{NODE_ENV}` | Environment-specific defaults |
| 3 | `.env.local` | Local overrides (all environments) |
| 4 (lowest) | `.env` | Global defaults |

### Example: NODE_ENV=development

```sh
$ echo "HELLO=development local" > .env.development.local
$ echo "HELLO=development" > .env.development
$ echo "HELLO=local" > .env.local
$ echo "HELLO=env" > .env
$ echo "console.log('Hello ' + process.env.HELLO)" > index.js

$ NODE_ENV=development dotenvx run --convention=flow -- node index.js
[dotenvx@1.X.X] injecting env (1) from .env.development.local, .env.development, .env.local, .env
Hello development local
```

### Default Environment

The plugin defaults `NODE_ENV` to `development` if not set. This means:

- If `NODE_ENV` is not set in the environment → uses `development`
- Loads `.env.development.local`, `.env.development`, `.env.local`, `.env`
- Sets `NODE_ENV=development` in the shell

---

## Encryption Support

### How It Works

Dotenvx uses **Elliptic Curve Integrated Encryption Scheme (ECIES)** (same as Bitcoin) for encryption:

1. **Public key** (`DOTENV_PUBLIC_KEY`) - Used to encrypt secrets, stored in `.env` file
2. **Private key** (`DOTENV_PRIVATE_KEY`) - Used to decrypt, stored in `.env.keys` file

### Encrypted .env File Example

```env
#/-------------------[DOTENV_PUBLIC_KEY]--------------------/
#/ public-key encryption for .env files /
DOTENV_PUBLIC_KEY="03f8b376234c4f2f0445f392a12e80f3a84b4b0d1e0c3df85c494e45812653c22a"

# Database configuration
DB_HOST="encrypted:BNr24F4vW9CQ37LOXeRgOL6QlwtJfAoAVXtSdSfpicPDHtqo/Q2HekeCjAWrhxHy+VHAB3QTg4fk9VdIoncLIlu1NssFO6XQXN5"
DB_NAME="encrypted:BGtVHZBbvHmX6J+J+xm+73SnUFpqd2AWOL6/mHe1SCqPgMAXqk8dbLgqmHiZSbw4D6VquaYtF9safGyucClAvGGMzgD7gdnXGB1YGGaPN7nTpJ4vE1nx8hi1bNtNCr5gEm7z+pdLq1IsH4vPSH4O7XBx"

# API Keys
API_KEY="encrypted:BD9paBaun2284WcqdFQZUlDKapPiuE/ruoLY7rINtQPXKWcfqI08vFAlCCmwBoJIvd2Nv3ACiSCA672wsKeJlFJTcRB6IRRJ+fPBuz2kvYlOiec7EzHTT8EVzSDydFun5R5ODfmN"
```

### .env.keys File

```env
DOTENV_PRIVATE_KEY="81dac4d2c42e67a2c6542d3b943a4674a05c4be5e7e5a40a689be7a3bd49a07e"
DOTENV_PRIVATE_KEY_PRODUCTION="4a650a4159790e2341a388ebcd7526036fd33cc6240667c7cd940cde7b11cfaf"
```

### Decryption in the Plugin

The plugin automatically decrypts encrypted values if:

1. **`.env.keys` file exists** in the project directory, OR
2. **`DOTENV_PRIVATE_KEY` environment variable** is set

```ts
// The config() call handles decryption automatically
const result = config({
  path: basePath,
  convention: "flow",
  processEnv,
  quiet: true,
})
```

### Encrypting Your .env Files

```bash
# Install dotenvx CLI
npm install -g @dotenvx/dotenvx

# Encrypt an existing .env file
dotenvx encrypt

# Set an encrypted value
dotenvx set API_KEY "secret-value"
```

### Security Best Practices

1. **Add `.env.keys` to `.gitignore`** - Never commit private keys
2. **Commit encrypted `.env` files** - Safe to share in version control
3. **Use environment-specific keys** - `DOTENV_PRIVATE_KEY_PRODUCTION` for production
4. **Set private keys in CI/CD** - Use GitHub Actions secrets or similar

---

## Dotenvx Config Options

The `config()` function accepts these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string \| string[]` | `process.cwd()` | Directory or file path(s) to load |
| `convention` | `"flow" \| "nextjs"` | - | File loading convention |
| `processEnv` | `object` | `process.env` | Object to populate with values |
| `overload` | `boolean` | `false` | Override existing env vars |
| `strict` | `boolean` | `false` | Throw on errors |
| `quiet` | `boolean` | `false` | Suppress console output |
| `ignore` | `string[]` | `[]` | Error types to ignore |
| `envKeysFile` | `string` | `.env.keys` | Path to private keys file |
| `debug` | `boolean` | `false` | Enable debug logging |

---

## Key Design Decisions

### 1. Using `processEnv` Object

```ts
const processEnv = {}
const result = config({ processEnv, ... })
```

- **Why:** We don't want to pollute `process.env` of the OpenCode process itself
- **Benefit:** Clean separation - values only go to spawned shells

### 2. Default NODE_ENV to Development

```ts
const nodeEnv = process.env.NODE_ENV || "development"
```

- **Why:** Matches typical development workflow
- **Benefit:** Developers don't need to set NODE_ENV manually

### 3. Non-Overriding Merge

```ts
if (!(key in output.env)) {
  output.env[key] = value
}
```

- **Why:** Existing shell env vars should take precedence
- **Benefit:** Allows overriding via shell or OpenCode settings

### 4. Quiet Mode

```ts
config({ quiet: true, ... })
```

- **Why:** Don't spam console with loading messages on every shell execution
- **Benefit:** Cleaner output

---

---

## Configuration Options

### Override Existing Variables

To let `.env` values override existing environment variables:

```ts
const result = config({
  path: basePath,
  convention: "flow",
  processEnv,
  overload: true,  // .env values override existing
  quiet: true,
})
```

### Custom Directory

Load from a custom directory:

```ts
const result = config({
  path: join(basePath, "config"),
  convention: "flow",
  processEnv,
  quiet: true,
})
```

### Environment Override

Set environment before running OpenCode:

```bash
NODE_ENV=production opencode
```

---

## .gitignore Configuration

Add these patterns to your `.gitignore` to keep sensitive data out of version control:

```gitignore
# Environment keys (private decryption keys)
.env.keys

# Local environment overrides (machine-specific)
.env.local
.env.*.local

# Optional: Keep development defaults local
.env.development.local
.env.test.local
```

### What to Commit

You **should commit** these files (they contain non-sensitive defaults or encrypted values):

```gitignore
# ✅ Commit these:
.env                    # Default values (non-sensitive)
.env.development        # Development defaults (non-sensitive)
.env.production         # Production defaults (non-sensitive)
.env.test               # Test defaults (non-sensitive)
.env.staging            # Staging defaults (non-sensitive)

# ❌ Don't commit these:
.env.keys              # Private decryption keys
.env.local              # Local machine overrides
.env.*.local           # Environment-specific local overrides
```

---

## Environment File Examples

### .env (Global Defaults)

```env
# These are safe to commit if they don't contain secrets
APP_NAME=MyApp
DATABASE_HOST=localhost
DATABASE_PORT=5432
LOG_LEVEL=info
```

### .env.development (Development)

```env
# Development-specific defaults (safe to commit)
DEBUG=true
LOG_LEVEL=debug
DATABASE_HOST=localhost
API_URL=http://localhost:3000
```

### .env.production (Production)

```env
# Production defaults (safe to commit)
LOG_LEVEL=warn
API_URL=https://api.example.com

# Use encrypted values for secrets
#/-------------------[DOTENV_PUBLIC_KEY]--------------------/
DOTENV_PUBLIC_KEY_PRODUCTION="03f8b376234c4f2f0445f392a12e80f3a84b4b0d1e0c3df85c494e45812653c22a"
DATABASE_PASSWORD="encrypted:BNr24F4vW9CQ37LOXeRgOL6QlwtJfAoAVXtSdSfpicPDHtqo/Q2HekeCjAWrhxHy+VHAB3QTg4fk9VdIoncLIlu1NssFO6XQXN5"
API_KEY="encrypted:BD9paBaun2284WcqdFQZUlDKapPiuE/ruoLY7rINtQPXKWcfqI08vFAlCCmwBoJIvd2Nv3ACiSCA672wsKeJlFJTcRB6IRRJ+fPBuz2kvYlOiec7EzHTT8EVzSDydFun5R5ODfmN"
```

### .env.local (Local Overrides - Gitignored)

```env
# Local machine-specific settings (don't commit!)
DATABASE_PASSWORD=my-local-password
MY_DEV_KEY=some-secret-key
```

### .env.development.local (Local Dev Overrides - Gitignored)

```env
# Override development settings locally
DEBUG=true
VERBOSE_LOGGING=true
```

---

## Troubleshooting

### Issue: Environment variables not loading

**Symptoms:** `echo $MY_VAR` returns empty

**Solutions:**
1. Check that `.env` files exist in the project root
2. Verify plugin file is in `.opencode/plugins/` directory
3. Check that `@dotenvx/dotenvx` is installed (run `bun install` in `.opencode/`)
4. Enable debug mode to see what's happening:

```ts
const result = config({
  path: basePath,
  convention: "flow",
  processEnv,
  debug: true,  // Enable debug logging
  ignore: ["MISSING_ENV_FILE"],
})
```

### Issue: Wrong environment loaded

**Symptoms:** Development variables used instead of production

**Solutions:**
1. Check `NODE_ENV` is set correctly: `echo $NODE_ENV`
2. Verify file names match environment: `.env.production` not `.env.prod`
3. Ensure `.env.keys` has the correct private key for the environment

### Issue: Encrypted values not decrypting

**Symptoms:** Variables show as `encrypted:...` strings

**Solutions:**
1. Ensure `.env.keys` file exists in project root
2. Verify `DOTENV_PRIVATE_KEY` or `DOTENV_PRIVATE_KEY_{ENVIRONMENT}` is set
3. Check that the public key in the `.env` file matches the private key in `.env.keys`

### Issue: Plugin slows down shell execution

**Symptoms:** Shells take a second or two to start

**Solutions:**
1. This is expected - file I/O occurs on every shell execution
2. Consider using `quiet: true` to reduce console output (already set)
3. For frequently accessed vars, set them in your system environment instead

---

## Quick Reference Card

### Project Structure

```
opencode-dotenv/
├── src/
│   └── load-dotenv.ts          # Main implementation (TypeScript)
├── .opencode/
│   ├── package.json             # Dependencies for shim
│   └── plugins/
│       └── load-dotenv.ts      # Shim (imports from src)
├── package.json                 # Root dependencies
├── test-plugin.ts               # Test suite
└── notes/
    └── opencode-dotenv-plugin.md # This documentation
```

### Setup Steps

```bash
# 1. Create directory structure
mkdir -p src .opencode/plugins

# 2. Create main plugin file in src/
# (See src/load-dotenv.ts for full implementation)

# 3. Create shim file in .opencode/plugins/
cat > .opencode/plugins/load-dotenv.ts << 'EOF'
// OpenCode Plugin Shim
// Re-export the plugin from src/
export { LoadDotEnv as LoadDotEnvPlugin } from "../../src/load-dotenv"
EOF

# 4. Create .opencode/package.json
cat > .opencode/package.json << 'EOF'
{
  "name": "opencode-dotenv-plugin",
  "private": true,
  "dependencies": {
    "@dotenvx/dotenvx": "^1.48.0"
  }
}
EOF

# 5. Install dependencies
cd .opencode && bun install && cd ..

# 6. Test the plugin
bun test-plugin.ts

# 7. Restart OpenCode (it will auto-load the plugin)
```

### Development Workflow

```bash
# 1. Edit src/load-dotenv.ts (TypeScript with types)
# 2. Run tests
bun test-plugin.ts
# 3. Restart OpenCode to load changes
# OpenCode will recompile and load the shim automatically
```

### Flow Convention File Order (NODE_ENV=development)

```
1. .env.development.local  (highest priority)
2. .env.development
3. .env.local
4. .env                 (lowest priority)
```

### Common Commands

```bash
# Encrypt an existing .env file
dotenvx encrypt

# Set an encrypted value
dotenvx set API_KEY "secret-value"

# Get a decrypted value
dotenvx get API_KEY

# Run with specific environment
NODE_ENV=production dotenvx run --convention=flow -- node index.js

# List all .env files
dotenvx ls
```

---


## CI/CD Integration

### GitHub Actions Example

When using this plugin with GitHub Actions, you don't need to modify your workflow - the plugin will automatically load encrypted environment variables if you provide the private key.

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Set the production private key as a repository secret
      - name: Set production private key
        run: echo "DOTENV_PRIVATE_KEY=${{ secrets.DOTENV_PRIVATE_KEY_PRODUCTION }}" >> $GITHUB_ENV

      # Install dependencies (includes plugin)
      - name: Install dependencies
        run: bun install

      # Run unit tests only (E2E tests require OpenCode CLI)
      # The plugin will automatically decrypt .env.production
      - name: Run unit tests
        run: bun run test:unit
```

### Using dotenvx Run in CI

If you're not using the plugin (e.g., for deployment scripts):

```bash
# With the private key set as an environment variable
DOTENV_PRIVATE_KEY="${DOTENV_PRIVATE_KEY_PRODUCTION}" dotenvx run --convention=flow -- npm run build
```

### Private Key Management

1. **Generate keys locally:**
   ```bash
   dotenvx encrypt --env production
   ```

2. **Extract private key from `.env.keys`:**
   ```bash
   cat .env.keys | grep DOTENV_PRIVATE_KEY_PRODUCTION
   ```

3. **Add as secret in your CI/CD platform:**
   - GitHub Actions: Settings → Secrets → New repository secret
   - GitLab CI/CD: Settings → CI/CD → Variables
   - CircleCI: Project Settings → Environment Variables

---

## Why This Plugin Is Needed

OpenCode has a built-in `.env` loader, but it only loads environment variables for:
- Provider API keys (OpenAI, Anthropic, etc.)
- OpenCode's own configuration

**It does NOT make these variables available inside the shells it spawns.** This plugin bridges that gap.

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
- [Dotenvx Documentation](https://dotenvx.com/docs/)
- [Dotenvx Flow Convention](https://dotenvx.com/docs/advanced/config-convention#flow-convention)
- [Dotenvx Encryption Guide](https://dotenvx.com/docs/quickstart/encryption)
- [Dotenvx GitHub](https://github.com/dotenvx/dotenvx)
- [Dotenvx npm Package](https://www.npmjs.com/package/@dotenvx/dotenvx)
