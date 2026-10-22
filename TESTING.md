# Verification — version 0.1.0

Checked on 22 October 2026.

- **38 core checks passed:** RSS 2.0, RDF/RSS 1.0 and Atom parsing; malformed/unsafe feeds; timestamps; grouping; local context; seven ranking factors; trends; cache pruning and cooldowns; country-specific defaults; city identity; CNN/publisher attribution; public social feeds and safe X profile shortcuts.
- **24 Chromium browser checks passed:** setup, US defaults, city-feed selection, source selection/discovery, custom-feed validation, background fetching into IndexedDB, grouping, explanations, related links, saving, hide/undo, Local, Latest, topic/search filtering, offline reopening, themes, responsive view, safe text rendering, Bluesky background fetching and X shortcuts without X host access. No application page errors or CSP errors were observed.
- **Firefox 157 live smoke check passed:** installed the Firefox package temporarily in an isolated profile, accepted its actual optional-host permission prompt, fetched and cached **108 live headlines** from BBC World, Guardian World and Al Jazeera, rendered 15 initial event cards, expanded all seven ranking explanations, saved a story and opened the saved view. The test profile was closed afterward.
- **Firefox package validation passed:** `web-ext lint` reported zero errors, warnings or notices.
- **Package checks passed:** both ZIPs contain valid manifests, their referenced assets exist, ZIP integrity passes, and neither production manifest requires host access or includes content scripts.
- **Live parser check passed:** 231 items across eight responding publisher feeds parsed successfully. Availability varies; an optional CBC request timed out during source checks. Feed errors are surfaced per source in Settings.
- **Expanded catalogue check passed:** the 12 added feed presets yielded 426 items, including 100 CNN entries through Google News. A live Bluesky author-feed response yielded eight original posts after excluding reposts/replies. Local searches for New York/United States and Sydney/Australia returned publisher-attributed results. Source access and ranking quality are separate concerns; a feed responding does not establish reporting accuracy.
- **Expanded Firefox live check passed:** the final package fetched 303 items with US defaults, including 100 CNN headlines, 55 publisher-attributed New York local results and 10 original Bluesky posts. All eight selected sources completed without an error. The native optional-host permission prompt was accepted in the isolated test profile.

Chromium automation uses synthetic feed responses and a temporary test-only manifest with pre-granted hosts. Distributed manifests keep hosts optional. Test screenshots are labelled as illustrative; `artifacts/firefox-live.png` comes from the live Firefox smoke check.

Brave was not launched independently. It uses the Chromium package. Firefox releases remain unsigned, and nothing has been published to a browser store.

Run the repeatable checks with `npm test`, `npm run test:browser`, and `npx --yes web-ext lint --source-dir dist/firefox` after building. See [README.md](README.md) for requirements and installation.
