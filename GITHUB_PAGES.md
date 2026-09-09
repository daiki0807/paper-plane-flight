# GitHub Pages deployment

This repository is configured to deploy the Paper Plane Flight game to GitHub Pages whenever `main` is updated. The workflow is stored at `.github/workflows/deploy-pages.yml` and builds the Vite output from `dist/public`.

After the first push, enable Pages in the repository settings if GitHub has not enabled the workflow environment automatically:

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Re-run the latest workflow if the first run was waiting for this setting.

The expected public URL is `https://daiki0807.github.io/paper-plane-flight/`.

Controls: tap/click or press **Space** to rise. Add `?demo` to the URL for deterministic autopilot verification.
