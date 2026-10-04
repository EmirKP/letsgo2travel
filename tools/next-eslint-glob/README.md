# Next ESLint directory-glob adapter

This private npm workspace replaces **only** the `fast-glob` dependency of
`@next/eslint-plugin-next@16.3.6`. The prerelease version `3.3.1-l2t.1` identifies
our adapter; it is not a release of the upstream fast-glob library. No upstream
fast-glob, micromatch or braces implementation is retained.

The original dependency chain brings in `braces@3.0.3`, affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
As checked on 4 October 2026, braces has no patched release and the latest Next
ESLint plugin still depends on fast-glob. Changing framework versions or
disabling the release audit would not safely resolve this dependency.

The pinned plugin only calls `globSync(string, { onlyDirectories: true })` in
`dist/utils/get-root-dirs.js`. This adapter implements that exact API using
[tinyglobby](https://github.com/SuperchupuDev/tinyglobby), with directory expansion
disabled and explicit handling for current working directory, absolute paths and
trailing slashes. Unsupported inputs/options throw. This is **not** a general
drop-in replacement for fast-glob.

The root package uses an exact scoped npm override plus a workspace link. A
transitive relative `file:` override is deliberately not used: npm resolves it
relative to the consuming package and can create a dangling link. The workspace
is included in Git so `npm ci` resolves it in a fresh checkout on every platform.

`tests/eslint-root-dirs.mjs`, included in `npm run test:release`, verifies the
reviewed plugin version/consumer, directory discovery and actual Next, React
hooks, accessibility and TypeScript violations. The directory-discovery fixtures
also passed against the original plugin's fast-glob implementation before the
replacement. Next.js, ESLint configuration and enabled rules remain unchanged.

When upgrading the plugin, review its use of globbing and remove this workspace
and override when upstream provides a dependency tree that passes the audit.
Do not widen the adapter to unrelated consumers without compatibility review.
