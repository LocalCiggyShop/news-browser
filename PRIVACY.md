# News Browser privacy

Version 0.1.0 — 22 October 2026

News Browser is a personal RSS/Atom and public-post reader. It has no developer-operated server, account, analytics, advertising, paid API or cloud AI service.

## Information stored locally

- Chosen country, optional city/region, feed sources, public social accounts, X profile shortcuts, theme, refresh interval and reading filters.
- Feed headlines, short publisher descriptions, source attribution, URLs, timestamps, category labels and related-report groups.
- Saved article links and metadata, hidden-story links and source-health information.

Preferences and saved links use browser extension local storage. Feed data uses IndexedDB. Neither is sent to the extension's developer or synced by this extension. Local data can still be accessible to someone with access to the browser profile.

Feed history is pruned to seven days, 1,600 items and a 6 MB item-data limit. Up to 300 saved links are stored separately. Settings provides feed-cache clearing and saved-link export; individual saved links can be removed from the reading list. Uninstalling the extension removes its browser-managed local storage.

## Network requests

The extension requests only feeds the user enables, directly from their HTTPS hosts. Publishers and their infrastructure receive normal connection information, including the IP address. Cookies and request credentials are omitted. Publisher links open in ordinary browser tabs, where the publisher's own policies and browser settings apply.

CNN headlines and optional city/country discovery are requested from Google News RSS. A local feed's query includes the chosen city and country; those values are sent to Google when that feed is enabled. Aggregated entries retain publisher attribution, and headline links go through Google News. Other direct publisher feeds do not depend on Google News.

Optional Bluesky feeds use the public, unauthenticated Bluesky author-feed endpoint; that service receives the requested account handle. Mastodon feeds request the public RSS endpoint on the selected account's server. X shortcuts are saved locally and make no background requests to X. Clicking a shortcut opens the profile normally; no X login credentials or cookies are collected by the extension.

No remote article images, external fonts, tracking pixels, browsing history, page contents or precise device location are requested by the extension. Choosing a regional feed naturally identifies the requested edition to that publisher. Location-based discovery uses the explicit local-feed query described above; no GPS or background location tracking is used.

## Permissions

- **Storage:** preferences and reading lists.
- **Alarms:** periodic feed checks while the browser runs.
- **Optional HTTPS host access:** fetching chosen feeds from the background process. Broad optional HTTPS capability allows adding a custom feed, but the extension requests access to each selected domain when settings are saved. Saving releases unselected host grants.

The extension has no content scripts and does not read open tabs or browsing history. It uses the browser's tab-creation API to open settings and articles without requesting tab-reading permission.

## User controls

Choose or disable sources in Settings, revoke host access through the browser's extension controls, change or remove the chosen location, export or remove saved links, clear the news cache, or uninstall the extension.

Publisher availability and privacy terms are outside this extension's control. The source code is included in this workspace for inspection.
