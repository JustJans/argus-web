# Workflows waiting for the `workflow` scope

GitHub refuses to let this machine's token create files under `.github/workflows/`
(the credential was issued without the `workflow` scope). The two workflows are kept here,
ready: once the token has the scope, move them to `.github/workflows/` and switch Pages
back to "GitHub Actions" as the source.

- `tests.yml` runs the tests on every push and pull request.
- `pile.yml` rebuilds the pile every six hours and publishes the site to GitHub Pages.

Until then the site is published from the `gh-pages` branch by `node builder/publish.mjs`.
