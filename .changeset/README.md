# Changesets

Every change that users of an npm package will notice gets a changeset:

```bash
npx changeset
```

Pick the packages, the bump (`patch`, `minor`, `major`; while pre-1.0 a
breaking change is a `minor`) and write one or two sentences for the package
changelog. The three npm packages are released together with one version.
See [RELEASING.md](../RELEASING.md).
