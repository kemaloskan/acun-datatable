# Releasing

The three npm packages (`@acunsoft/datatable-core`, `-http`, `-dom`) are
released together with one version, using
[Changesets](https://github.com/changesets/changesets). Nothing is published
automatically.

## For every user-visible change

```bash
npx changeset
```

Choose the bump (`patch`, `minor`; while the version is below 1.0 a breaking
change is a `minor`, see SPEC "Planned release approach") and describe the
change for users. Commit the generated `.changeset/*.md` with the change.

## Cutting a release

1. On an up-to-date `main`:

   ```bash
   npm run version-packages
   ```

   This applies the changesets: bumps the versions, updates the internal
   dependency versions and the lockfile, and writes each package's
   `CHANGELOG.md`. Review the diff, move the matching notes out of
   "Unreleased" in the root `CHANGELOG.md`, and commit
   (`chore: release 0.x.y`) through a pull request so CI runs.
2. Start the **Release** workflow by hand (Actions → Release → Run workflow,
   on `main`). It refuses to run while unversioned changesets exist, runs the
   Chromium end-to-end tests, then `npm run release` (check, test, build,
   `changeset publish` with provenance) and pushes the `@acunsoft/…@x.y.z` tags.

To publish from a machine instead: `npm login`, then `npm run release`, then
`git push --tags`. Use `npx changeset pack` to inspect the exact tarballs first.

## One-time setup

- [x] The `@acunsoft` npm scope belongs to the project owner.
- [ ] `repository`, `homepage`, `bugs` and `author` in each `package.json` (npm
      provenance requires `repository.url` to match the GitHub repository).
- [ ] `NPM_TOKEN` repository secret: an npm automation token with publish
      rights to `@acunsoft`. After the first release, npm trusted publishing
      (OIDC) can replace the token.
- [ ] Packagist: Packagist reads `composer.json` from the **repository root**,
      so `packages/adapter-laravel` needs its own read-only repository (for
      example `acunsoft/datatable-laravel`, kept in sync by a subtree-split
      action) registered on Packagist. Composer versions come from that
      repository's git tags.
