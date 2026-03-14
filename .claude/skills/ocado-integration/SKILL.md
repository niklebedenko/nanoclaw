---
name: ocado-integration
description: Ocado grocery integration for NanoClaw. Search products, read and modify basket, read saved lists. Cannot checkout — only the user can trigger payment. Triggers on "ocado", "grocery", "shopping", "basket", "add to basket".
---

# Ocado Integration

Browser automation for Ocado grocery shopping via WhatsApp/Telegram.

> **Compatibility:** NanoClaw v1.0.0.

## Features

| Tool | Description |
|------|-------------|
| `ocado_search` | Search for products by name |
| `ocado_get_basket` | Read current basket contents |
| `ocado_add_to_basket` | Add items to basket by product ID |
| `ocado_get_lists` | Read saved shopping lists |

**Intentionally absent:** `ocado_checkout` — the agent can never place orders. Only the user can checkout by clicking the URL returned by the tools.

## Prerequisites

1. NanoClaw installed and running
2. Playwright installed: `npm ls playwright || npm install playwright`
3. Chrome available and `CHROME_PATH` configured in `.env` if needed

## Quick Start

```bash
# 1. Copy skill files into place
cp -r /workspace/extra/ocado-integration .claude/skills/ocado-integration

# 2. Run one-time login (opens Chrome)
npx dotenv -e .env -- npx tsx .claude/skills/ocado-integration/scripts/setup.ts
# Verify: data/ocado-auth.json should exist

# 3. Wire up host-side handler in src/ipc.ts
#    (see Integration Points below)

# 4. Wire up container-side tools in container/agent-runner/src/ipc-mcp.ts
#    (see Integration Points below)

# 5. Rebuild container
./container/build.sh

# 6. Rebuild host and restart
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

## Integration Points

### 1. Host side: `src/ipc.ts`

Add import:
```typescript
import { handleOcadoIpc } from '../.claude/skills/ocado-integration/host.js';
```

In `processTaskIpc` switch statement default case, add before the existing default handler:
```typescript
default:
  const handledByOcado = await handleOcadoIpc(data, sourceGroup, isMain, DATA_DIR);
  if (!handledByOcado) {
    logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
```

> If the X integration is also installed, chain the handlers:
> ```typescript
> default:
>   const handled = await handleXIpc(data, sourceGroup, isMain, DATA_DIR)
>     || await handleOcadoIpc(data, sourceGroup, isMain, DATA_DIR);
>   if (!handled) logger.warn({ type: data.type }, 'Unknown IPC task type');
> ```

### 2. Container side: `container/agent-runner/src/ipc-mcp.ts`

Add import:
```typescript
// @ts-ignore - Copied during Docker build
import { createOcadoTools } from './skills/ocado-integration/agent.js';
```

Add to tools array:
```typescript
...createOcadoTools({ groupFolder, isMain })
```

### 3. Dockerfile: `container/Dockerfile`

Add COPY line after other skill copies:
```dockerfile
COPY .claude/skills/ocado-integration/agent.ts ./src/skills/ocado-integration/
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_PATH` | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | Chrome executable |
| `NANOCLAW_ROOT` | `process.cwd()` | Project root |

## Data Directories

| Path | Purpose |
|------|---------|
| `data/ocado-browser-profile/` | Chrome profile with saved Ocado session |
| `data/ocado-auth.json` | Auth state marker |

Both are in `.gitignore` — never commit these.

## Usage

```
@Andy search Ocado for oat milk
@Andy what's in my Ocado basket?
@Andy add product ID 12345 to my Ocado basket
@Andy show my Ocado saved lists
```

## Troubleshooting

### Auth expired
```bash
rm data/ocado-auth.json
npx dotenv -e .env -- npx tsx .claude/skills/ocado-integration/scripts/setup.ts
```

### Browser lock files
```bash
rm -f data/ocado-browser-profile/Singleton*
```

### API endpoints changed
Ocado's internal API paths are undocumented and may change. If scripts return errors about API paths, inspect the network tab on ocado.com while browsing and update the fetch URLs in the relevant script files. The main paths to check:
- Search: `/api/search/v2/products`
- Basket: `/api/v4/trolley`
- Add to basket: `/api/v4/trolley/items`
- Lists: `/api/v4/lists`

### Check logs
```bash
grep -i "ocado" logs/nanoclaw.log | tail -20
```
