# Home Game Live — read-only viewer

This is a **public** static GitHub Pages frontend. The native Home Game application repository stays **private**.

## Security
- Visitors receive a random 256-bit capability token in the URL fragment (`#v=<token>`), which is not sent to GitHub Pages in HTTP requests.
- No private native app source, server-side secrets, write credentials or player data are ever stored here.
- The browser sends only the token to the separately deployed read-only HTTPS API, using POST and `Cache-Control: no-store`.
- The service must enforce token expiration and immediate revocation, and return the minimum approved live snapshot.
- The website polls every five seconds, displays staleness accurately and never performs game edits.

## CloudKit integration

No independent backend is needed. The iPhone writes only AES-256-GCM ciphertext
to a random CloudKit public database record. The share link fragment contains
both the unguessable record name and the 256-bit decryption key. The browser
submits only the record name to Apple's CloudKit Web Services and decrypts
locally with Web Crypto.

To activate this frontend, configure Apple CloudKit:

1. Register and associate iCloud.com.saarzvi.homegame with the Home Game App ID.
2. Add this container to the signed app entitlements and provisioning profile.
3. Define HomeLiveSnapshot record type with ciphertext (String) and expiry (Date).
4. Deploy schema from CloudKit Development to Production.
5. In CloudKit Console > API Access, create a web token restricted to https://saarzvi.github.io.
6. Set apiToken in public config.json (browser token, NOT an Apple secret key).
7. Rebuild/re-sign the native iOS app and test publish, view, and revoke on two devices.

The apiToken in config.json is currently intentionally empty; the viewer
displays a preparation screen instead of pretending to show real-time data.

Deleting a CloudKit record revokes future reads but cannot undo screenshots or
other data someone already copied.
