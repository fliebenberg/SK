# SK Project

## Unified Versioning

This project uses [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) to automatically handle Semantic Versioning (SemVer) across the `client`, `server`, and `shared` packages.

### How to Release

1. Commit your features and bug fixes using conventional commit prefixes:
   - `feat: added new dashboard` (Triggers a MINOR bump)
   - `fix: resolved infinite loading` (Triggers a PATCH bump)
   - `chore: updated dependencies` (No version bump)
   
   If a single commit contains both a fix and a chore, prefix it with `fix:` so that it correctly triggers a patch release and is included in the changelog.

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
