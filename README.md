# Inventory Web App (GitHub Pages + Apps Script API)

This repo hosts the frontend on GitHub Pages and calls a Google Apps Script web app as an API.

## Structure
- `appscript/` — Apps Script backend files to paste into the Apps Script project.
- `web/` — frontend source for GitHub Pages (HTML/CSS/JS).
- `web/modules/` — JavaScript modules used by `web/app.js`.
- `web/dist/` — production build output (generated via `npm run build`).
- `scripts/` — build helper scripts.
- `appscript/reference/InventoryDB.xlsx` — reference data (not used at runtime).
- `web/assets/draft of app layout.png` — UI mockup reference.

## Setup

1) Deploy the Apps Script as a Web App
- In Apps Script, add the contents of `appscript/code.gs`
- In Apps Script: Deploy -> New deployment -> Web app
- Execute as: Me
- Who has access: Anyone
- Copy the Web app URL
- In the Inventory sheet, add a `Quantity` column between `Room` and `Notes` (column E). `Deleted` becomes column I.

2) Update frontend config
- In `web/index.html`, set:
  - `meta[name="api-url"]` to your Apps Script Web App URL
  - `meta[name="google-client-id"]` to your OAuth Client ID

3) Configure OAuth Client ID
- Google Cloud Console -> OAuth Client ID
- Authorized JavaScript origins:
  - `https://<your-username>.github.io`
  - (add custom domain if you use one)

4) Enable GitHub Pages (recommended)
- GitHub repo -> Settings -> Pages
- Source: **GitHub Actions**
- The workflow builds and deploys `web/dist` on every push to `main`

## Build (optional, minified assets)
- Requires Node.js 16+
- `npm install`
- `npm run build` to generate `web/dist` with minified JS/CSS
- The build rewrites `web/dist/index.html` to use bundled `app.min.js` and `styles.min.css`
- If you add a `package-lock.json`, you can switch the workflow to `npm ci` and enable npm caching

## Alternative: deploy from branch
GitHub Pages only allows `/(root)` or `/docs` for branch deployments. If you prefer that approach, move the contents of `web/` into `/docs` or the repo root.

## Copy checklist
- Apps Script: copy `appscript/code.gs` into your Apps Script project.
- GitHub: commit and deploy via GitHub Actions (workflow publishes `web/dist`).

## Notes
- The API validates Google ID tokens server-side.
- If you redeploy Apps Script, update the Web App URL in `web/index.html`.
- If `Quantity` is missing, it will default to `1`.
- Non-admin users only see their own entries in the UI.
