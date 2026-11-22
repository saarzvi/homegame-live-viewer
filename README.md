# Home Game Live — read-only viewer

This is a **public** static GitHub Pages frontend. The native Home Game application repository stays **private**.

## Security
- Visitors receive a random 256-bit capability token in the URL fragment (`#v=<token>`), which is not sent to GitHub Pages in HTTP requests.
- No private native app source, server-side secrets, write credentials or player data are ever stored here.
- The browser sends only the token to the separately deployed read-only HTTPS API, using POST and `Cache-Control: no-store`.
- The service must enforce token expiration and immediate revocation, and return the minimum approved live snapshot.
- The website polls every five seconds, displays staleness accurately and never performs game edits.

## Backend setup
Currently `config.json` has an intentionally empty `apiBaseUrl`. The website is **not yet connected to live game data**.
After provisioning a secure backend, configure `apiBaseUrl` in `config.json` as the fully qualified HTTPS API base, e.g.

```json
{"apiBaseUrl":"https://api.example.com/live-table"}
```

The API must serve `POST {apiBaseUrl}/view`, accepting `{token: string}` and returning `{snapshot: {...}}` or HTTP 410 when revoked.

The snapshot contains version, groupName, startedAt, updatedAt, status, potMinor, playerCount, buyInsTotal, an array of `players` (`name`, `buyInCount`, `totalInMinor`), and optional `bestHand` (`playerName`, `category`, `holeCards`, `boardCards`).
Amounts are integer minor units. Only data approved for spectators should be published.
