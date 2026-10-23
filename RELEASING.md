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
   `changeset publish` through npm trusted publishing, with provenance) and
   pushes the `@acunsoft/…@x.y.z` tags. No npm token is involved.

To publish from a machine instead: `npm login` (with 2FA), then
`npm run release`, then `git push --tags`. Use `npx changeset pack` to inspect
the exact tarballs first.

### First release (once)

npm trusted publishing can only be set up for a package that exists, so the
first version is published from a machine:

1. `npm run version-packages`, review, commit and push (`chore: release 0.1.0`).
2. `npm login` as `acunsoft` (2FA), then `npm run release` and `git push --tags`.
3. On npmjs.com, for each of the six packages: Settings → Trusted Publisher →
   GitHub Actions, organization or user `kemaloskan`, repository
   `acun-datatable`, workflow `release.yml`. Then set "Publishing access" to
   require 2FA and disallow tokens.

Every later release goes through the Release workflow.

## Laravel package (Packagist)

Packagist reads `composer.json` from a repository root, so the
**Laravel package split** workflow mirrors `packages/adapter-laravel`, with its
history, to the read-only repository
[kemaloskan/datatable-laravel](https://github.com/kemaloskan/datatable-laravel)
on every push to `main` that touches it. Never commit there directly.

To release a Composer version, tag the monorepo and push the tag:

```bash
git tag laravel-v0.1.0 && git push origin laravel-v0.1.0
```

The workflow turns it into the tag `v0.1.0` in the split repository, which
Packagist reads as the version.

## One-time setup

- [x] The `@acunsoft` npm scope belongs to the project owner.
- [x] `repository`, `homepage`, `bugs` and `author` in each `package.json` and
      `composer.json`.
- [x] npm account `acunsoft` owns the `@acunsoft` scope (2FA with a security key).
- [x] First release from a machine: 0.2.0 on 2026-10-23. With a security key,
      `npm run release` opens a browser approval for the first package; tick
      "skip 2FA for 5 minutes" and the rest follow.
- [ ] Trusted publishers on npmjs.com for all six packages (see "First
      release" above). No `NPM_TOKEN` secret: tokens that bypass 2FA are being
      restricted by npm.
- [ ] `SPLIT_TOKEN` repository secret: a fine-grained GitHub token with
      "Contents: read and write" on `kemaloskan/datatable-laravel` only.
- [ ] Submit `https://github.com/kemaloskan/datatable-laravel` on
      [packagist.org](https://packagist.org/packages/submit) and enable its
      GitHub auto-update hook.
