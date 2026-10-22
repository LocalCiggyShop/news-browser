# News Browser v0.1.0

First release candidate of a free personal news reader for desktop Chrome, Brave and Firefox.

- Top, Latest, Local and World views, with explanations based on the seven newsworthiness values.
- 22 source presets. Suggested sources follow the selected country: US options include CNN, NPR and PBS; other supported countries have their own services.
- Optional city/country discovery with original local-publisher attribution. CNN and local discovery are clearly labelled as coming through Google News RSS.
- Public Bluesky and Mastodon feeds. X accounts can be saved as profile shortcuts; X posts are not automatically imported.
- Related-report grouping, search, topic filters, saved links, hide/undo, themes, an expanded view and offline caching.
- Local processing with no backend, paid APIs, credentials, account requirement or analytics.

## Install

**Chrome / Brave:** download `news-browser-chrome.zip`, extract it, open `chrome://extensions` or `brave://extensions`, enable Developer mode, choose Load unpacked and select the extracted folder containing `manifest.json`.

**Firefox 142+:** download and extract `news-browser-firefox.zip`, open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on and select the extracted `manifest.json`. This build is unsigned; temporary installation lasts until Firefox restarts. A permanent Firefox release requires Mozilla signing.

Choose a country and optional city, select sources, and save to grant access to the selected feed domains. When upgrading an unpacked installation, replace its files and click Reload in the extension manager.

## Verification and limits

38 core checks and 24 Chromium browser checks passed. Firefox package validation and live smoke checks are recorded in TESTING.md.

English news only in this first version. Newsworthiness, grouping and location matching are estimates. Trends require four hours of observations. Public feeds can change or be blocked; Google News RSS is not a contracted API. Original articles may have publisher paywalls. Enabling local discovery shares the chosen city/country query with Google; see PRIVACY.md for details. Brave uses the Chromium package and has not been separately tested.

The packages require no paid runtime services. Nothing is published to a browser extension store.
