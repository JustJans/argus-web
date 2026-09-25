# Workflows waiting for the `workflow` scope

GitHub refuses to let this machine's token create files under `.github/workflows/`
(the credential was issued without the `workflow` scope). The workflow is kept here, ready:
once the token has the scope, move it to `.github/workflows/`.

- `tests.yml` runs the tests on every push and pull request.

The pile is built on the home server from the crawler's store, which only that machine has, and
the site is published from the `gh-pages` branch by `node builder/publish.mjs` (ops/crontab).
