# Automatic Anonymous Session — implementation report

## Files

| File | Change |
| --- | --- |
| `src/services/session.service.ts` | Shared account/Anonymous transaction, preflight, append-only recovery captures, lock, durable journal, rollback/retry, post-reload verification, prevent anonymous recapture. |
| `src/services/cookie.service.ts` | Context/store/partition-aware reads; preserve host-only and cookie attributes; resolve name/path/domain collisions; propagate mutation errors without logging secrets. |
| `src/services/auth-adapter.service.ts` (new) | Validate/store exact per-host rules; manipulate only selected local/sessionStorage keys; DOM verification through isolated-world scripting. |
| `src/storage/session.storage.ts` | Serialize mutations of session array to avoid lost concurrent writes. |
| `src/types/auth.ts` (new) | Adapter and virtual-profile status types. |
| `src/types/cookie.ts` | Optional hostOnly/partitionKey metadata; literal SameSite values. |
| `src/types/session.ts` | Optional store, recovery flag, selected authentication storage; existing v1 snapshots remain readable. |
| `src/services/export-import.service.ts` | Validate new optional snapshot fields; retain export schema version 1. |
| `src/background/index.ts` | Route Anonymous/status/adapter/recovery operations; validate imports again at worker boundary. |
| `src/messaging/messages.ts`, `src/messaging/client.ts` | New messages and typed UI client; surface failures. |
| `src/popup/AnonymousSession.tsx` (new) | Virtual profile, mode/verification status, adapter editor, recovery action, errors. |
| `src/popup/App.tsx` | Integrate virtual card for current website and refresh its status when sessions change. |
| `src/popup/SessionCard.tsx` | Surface switch/update/rename/delete errors, label Recovery, prevent its Update action. |
| `src/popup/hooks/useCurrentTab.ts` | Require HTTP(S) protocol rather than just any URL hostname. |
| `src/styles/global.css` | Reuse existing visual tokens for virtual profile and adapter editor. |
| `manifest.json` | Add scripting permission for selected storage and DOM verification; no new host permissions. |
| `package.json`, `tsconfig.json` | Add test/typecheck scripts; Chrome types and ES2024 library for existing Promise.withResolvers usage. |
| `tests/session.test.mjs`, `tests/ts-loader.mjs` (new) | 19 Node tests with Chrome API mocks and native TypeScript loader. |
| `README.md` | Configuration example, architecture, recovery, browser/storage/website limits, testing instructions. |
| `dist/*` | Rebuilt production extension. |

The worktree already contained dist/cache changes from the earlier build/run attempt;
those were not reset. No production browser session was touched.

## Execution and snapshots

UI → runtime message → background → session service → Chrome cookies/storage APIs
and isolated-world script → reload completion → adapter DOM verifier → UI status.

The Anonymous choice has no account cookies of its own. A configured adapter
identifies auth cookie names/domains/paths and exact storage keys. Only these are
removed. Reload lets the website create any guest session normally; the extension
never requests logout/revoke/bootstrap URLs.

Before mutation a fresh Recovery session is appended (when auth is present), and a
durable rollback journal is written. Saved A/B snapshots are never recaptured by
switching. Rotated credentials are in Recovery snapshots. Anonymous cannot Update
an account; Recovery cannot be overwritten through Update. Normal account
switching reuses the transaction. Failure restores previous local auth when
possible; a failed recovery keeps its journal and blocks new switching. Recover
can be retried on the same origin/store, including a replacement tab.

## Validation actually run

Environment: Node v24.22.1, using `/private/tmp/session-switcher-node` because `node`
and `npm` are absent from PATH. The following are direct equivalents of the new
package scripts (no dependency installation was needed):

```sh
/private/tmp/session-switcher-node node_modules/typescript/bin/tsc --noEmit
/private/tmp/session-switcher-node --experimental-loader ./tests/ts-loader.mjs --test tests/*.test.mjs
/private/tmp/session-switcher-node node_modules/vite/bin/vite.js build
```

- Typecheck: passed.
- Unit/integration with mocks: 19 passed, 0 failed. Includes multiple accounts,
  multi-cookie auth, local/sessionStorage, preference/draft preservation, rotated
  cookies, host-only/domain/path collisions, partition/store isolation, expiration,
  verifier failure/revocation simulation, mutation failure, incomplete rollback,
  durable recovery/replacement tab, legacy schema, concurrency and unsupported sites.
- Production build: passed. Existing Vite/CRXJS warnings remain concerning JSON
  import attributes and simultaneous rollupOptions/rolldownOptions.
- `git diff --check`: passed.
- Lint: not run; repository has no lint script/configuration.
- Real Chromium E2E/local HTTP authentication site: not run. Computer Use did not
  receive permission to access Vivaldi in this session. Tests simulate the browser
  APIs and execute the real injected storage/verifier functions; they do not
  establish production website compatibility.

## Implemented but not browser-validated

Chrome API integration, real CHIPS/store behavior, service-worker interruption,
DOM selectors, and popup interaction are implemented and covered by mocks/build,
not verified in a live browser. Reload the extension from dist, configure a
reviewed adapter on a disposable test website, then exercise the documented flows.

No production adapters are bundled. Unsupported websites show a clear status and
Anonymous stays disabled until configured. Adapter configuration does not require
capturing anonymous cookies. Chrome 132+ partition-key API is required for adapter
switching. Without a verifier results are explicitly Unverified. Verifiers assert
logged-in/out state, not account identity. IndexedDB, cross-origin iframe/SSO auth,
website service-worker caches, in-memory tokens, network anonymity and isolated
anonymous bootstrap are not supported. Server validity/rotation cannot be
controlled by this extension. See README for legacy-snapshot and concurrent-tab
limitations.
