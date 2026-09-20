# SK Project

All multi-platform client development takes place in **`expo-app/`**.

**AI Agents:** Start by reading the [OKF Index](file:///c:/Fred/Coding/SK/okf/index.md) to understand the codebase architecture, design system requirements, database schema layouts, and active workspace rules before making any changes.

---

## Pre-commit checks

Run this once per clone:

```sh
npm run hooks:install     # from the repo root — or just `npm install` there, which does it too
```

It points `core.hooksPath` at [.githooks/](file:///c:/Fred/Coding/SK/.githooks/), where `pre-commit`
runs two static checks on every commit:

| Check | Fails when |
| --- | --- |
| `expo-app/scripts/check-actions.js` | a socket action is sent outside `sendAction`, which puts the reply contract back in the hands of the call site |
| `server/scripts/check-migrations.js` | a migration is missing from the catalogue in [okf/database.md](file:///c:/Fred/Coding/SK/okf/database.md), or touches a table `init-db.ts` never mentions |

Both are dependency-free node scripts and together take about a quarter of a second, so they work in
a fresh clone with nothing installed. Either can be run on its own — `npm run check:actions` in
`expo-app/`, `npm run check:migrations` in `server/`.

Git config is per-clone and not cloned with the repo, which is why the step above is needed at all.
`git commit --no-verify` bypasses the hook when you genuinely need to.

**The checks read the working tree, not the index**, so a partially staged commit is checked against
all your edits rather than the ones being committed. Fixing that means stashing unstaged work inside
a hook, which is a worse trade than the occasional confusing refusal.

---

## Unified Versioning

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to automatically handle Semantic Versioning (SemVer) across the `server` and `shared` packages.

### Commit Prefixes

When committing, use one of the following prefixes based on the Conventional Commits specification. These prefixes determine how the version number is bumped during a release.

| Prefix | Description | Example | Version Bump |
|---|---|---|---|
| `feat:` | A new feature | `feat: add user profile page` | **MINOR** |
| `fix:` | A bug fix | `fix: resolve infinite loading` | **PATCH** |
| `build:` | Changes to the build system or external dependencies | `build: add release npm script` | None |
| `chore:` | Routine tasks, maintenance, dependency updates | `chore: update react to v18` | None |
| `ci:` | Changes to CI configuration scripts | `ci: add github actions workflow` | None |
| `docs:` | Documentation-only changes | `docs: add commit prefixes to README` | None |
| `style:` | Formatting changes (whitespace, missing semicolons, etc.) | `style: format code with prettier` | None |
| `refactor:` | A code change that neither fixes a bug nor adds a feature | `refactor: extract user validation logic` | None |
| `perf:` | A code change that improves performance | `perf: improve rendering speed of dashboard` | None |
| `test:` | Adding missing tests or correcting existing tests | `test: add unit tests for auth store` | None |

*Note: You can append an exclamation mark `!` after any prefix (e.g., `feat!: new API layout`) to indicate a **BREAKING CHANGE**, which triggers a **MAJOR** version bump.*

### How to Release

1. Commit your changes using conventional commit prefixes (see table above).
   
   If a single commit contains multiple types of changes (e.g., a fix and a chore), use the prefix of the most significant change (`fix:` in this case) so that it correctly triggers a release and is included in the changelog.

2. When ready to cut a release, run the following command from the root directory:
   ```bash
   npm run release
   ```

3. This command will:
   - Calculate the next version number.
   - Update `package.json` files in the root, `server`, and `shared` directories.
   - Automatically generate `CHANGELOG.md`.
   - Create a git commit and a tag for the release.

4. Push the new version and tag to the repository:
   ```bash
   git push --follow-tags
   ```
   **Tip:** You can perform both the release and push together by running:
   ```bash
   npm run release:push
   ```
