# Project Guide for New Agents

This file is the single source of truth for how to work on this Google Apps Script inventory scanner UI/UX. Update it whenever you change flows, structure, or conventions.

## What’s in this repo
- `web/index.html` — the entire client-side UI (HTML/CSS/JS). No bundler or external frameworks; runs as a static page for GitHub Pages.
- `appscript/code.gs` — server-side Apps Script endpoints (not modified here unless requested).
- `appscript/reference/InventoryDB.xlsx` — reference data (not used at runtime).
- `web/assets/draft of app layout.png` — UI mockup reference.

## Current UI/UX shape
- Mobile-first, oversized controls using CSS `clamp()` for height/font sizing; sticky action bar for Save/Clear/Sync.
- Scanner runs in a bottom sheet (mobile) with start/stop, continuous toggle, camera selector; inline sheet only.
- Room picker opens as its own sheet. Offline queue supported with localStorage.
- Entries screen has search, admin edit/delete (when `isAdmin=true` from server).

## Key JS behaviors (`web/index.html`)
- Offline queue: localStorage key `icsInventoryOfflineQueue_v1`; sync uses `syncOfflineQueue()` and currently calls `saveEntry` per item without local prepend (only refresh at end).
- Scanner lifecycle: `startScanner` / `stopScanner` manage ZXing; auto-stop after detection if not continuous; closing sheets stops camera.
- Layout: responsive via classes `is-mobile` (width < 860), sticky actions bar; safe-area padding applied.
- Plans to avoid: do not introduce modules/build steps; keep vanilla JS and inline CSS/JS.

## How to make changes safely
1. Work in `web/index.html` only for UI/JS unless explicitly asked to touch `appscript/code.gs`.
2. Preserve existing flows: offline queue, toasts, admin edit/delete, ZXing scanner, room picker sheet.
3. When adjusting layout/sizing, prefer `clamp()`/relative units instead of fixed px. Keep inputs from triggering mobile zoom (`font-size` >= 16px and already set via clamp).
4. If you modify flows (e.g., offline sync logic, scanner, sheets), document the change in this file under “Changelog for collaborators”.
5. Before shipping, scan for regressions to camera lifecycle (stop on tab switch/pagehide) and offline queue integrity (no dupes).

## Changelog for collaborators
- 2025-01-XX: Added this guide. Current state: bottom-sheet scanner, sticky actions bar, large controls via clamp, offline sync without local prepend in `syncOfflineQueue()`.
- 2025-12-27: Split repo into `appscript/` and `web/` folders for clean copy to Apps Script and GitHub Pages.

## When you update things, add notes here
- Describe what changed (UI/logic), date, and any follow-up TODOs.
- Note any known quirks (e.g., sticky bar overlap risk, offline sync UX).

## Quick start checklist
- Need the scanner? Use `openScannerSheet()`; ZXing is already loaded via CDN.
- Need rooms? Use `openRoomSheet()`; data comes from `getInitialData()` server call.
- Need to sync offline? Call `syncOfflineQueue()`; it drains localStorage and hits `saveEntry`.
- Avoid external deps; keep everything inline and HtmlService-compatible.
