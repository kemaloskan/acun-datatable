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
- [ ] `NPM_TOKEN` repository secret: an npm automation token with publish
      rights to `@acunsoft`. After the first release, npm trusted publishing
      (OIDC) can replace the token.
- [ ] `SPLIT_TOKEN` repository secret: a fine-grained GitHub token with
      "Contents: read and write" on `kemaloskan/datatable-laravel` only.
- [ ] Submit `https://github.com/kemaloskan/datatable-laravel` on
      [packagist.org](https://packagist.org/packages/submit) and enable its
      GitHub auto-update hook.
