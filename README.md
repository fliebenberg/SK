# SK Project

## Unified Versioning

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to automatically handle Semantic Versioning (SemVer) across the `client`, `server`, and `shared` packages.

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
   - Update `package.json` files in the root, `client`, `server`, and `shared` directories.
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
