---
trigger: always_on
---

### N8N Repository Specific Rules and Development Environment


### Docker Build Issues
- **Turbo Concurrency**: When building from source in Docker (`Dockerfile.source`), `turbo` may not respect dependency ordering correctly in clean builds.
  - **Fix**: Use `pnpm build --concurrency=1` to enforce sequential builds.
- **Missing Types**: `@n8n/node-cli` may fail to build if `@n8n/eslint-plugin-community-nodes` types aren't found.
  - **Fix**: Add a declaration stub (e.g., `packages/@n8n/node-cli/src/types/eslint-plugin-community-nodes.d.ts`).

### Local Development Tips
- **AI Features**: When implementing local fallback for AI features (like "Ask AI"), use existing transitive dependencies (e.g., `@langchain/anthropic` via `@n8n/ai-workflow-builder`) instead of adding new direct dependencies to `packages/cli` to avoid lockfile synchronization issues in Docker.
- **Lockfiles**: `Dockerfile.source` uses `--frozen-lockfile`. Any changes to `package.json` must be reflected in `pnpm-lock.yaml`, but relying on existing dependencies is safer for quick patches.
  - **Prerequisite**: If you *must* add a new dependency, run `pnpm install` locally on your host machine first to update `pnpm-lock.yaml`, then rebuild usage: `docker compose up -d --build`. This ensures the lockfile copied into Docker matches the `package.json`.

### Adding New Dependencies - Correct Order of Operations

**Rule #1**: Before adding ANY new dependency, check if it's already available as a transitive dependency:
```powershell
pnpm why <package-name>
```

If the package is already available (e.g., `@langchain/anthropic` via `@n8n/ai-workflow-builder`), import from the existing package instead of adding a new dependency.

**If you must add a new dependency**, follow this exact order:

1. **Edit** the appropriate `package.json` file
2. **Run** `pnpm install` locally to update `pnpm-lock.yaml`
3. **Verify** both files are modified: `git status`
4. **Test local build** first: `pnpm build --filter=<package-name>`
5. **Test Docker build**: `docker compose build n8n`
6. **Commit** both `package.json` and `pnpm-lock.yaml` together
7. **Start containers**: `docker compose up -d`

**Critical Rules**:
- NEVER modify `package.json` and run Docker build without first running `pnpm install` locally
- ALWAYS commit `pnpm-lock.yaml` with `package.json` changes
- TEST local build before Docker build (faster feedback, 1-2 min vs 5-10 min)
- REVIEW `pnpm-lock.yaml` diff for unexpected version bumps before committing