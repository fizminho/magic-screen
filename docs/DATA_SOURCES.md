# Data sources and third-party components

## Authentication

| Component | Version | Licence | Use | Notes |
|---|---:|---|---|---|
| `@passwordless-id/webauthn` | 2.4.1 | MIT | Browser passkey ceremony and Worker-side WebAuthn response verification | Documents Cloudflare Workers/WebCrypto support. Server verifies challenge, origin, RP ID hash, user verification and authentication signatures. We additionally check registration user-presence flags, raw credential ID against the attested credential ID, algorithm consistency, cross-origin client data and the discoverable user handle. No private key or biometric data is stored by this app. |

References:
- https://github.com/passwordless-id/webauthn
- https://webauthn.passwordless.id/registration/
- https://webauthn.passwordless.id/authentication/

The library is used as a dependency; no demo code was copied. Its browser client emits debug messages, so the app temporarily suppresses `console.debug` only while a passkey ceremony is running.

## Market data

No market quote provider has been enabled in this rebuild branch yet. Do not treat any displayed price as live until the adapter, source terms and timestamps are documented and tested.

## News and filings

No RSS, news or filing source has been enabled in this rebuild branch yet. Only official feeds/APIs or sources whose terms permit the intended personal use may be added. Do not scrape authenticated sites or bypass access controls.

## AI provider

Gemini has not been wired into the replacement Worker yet. Before implementation, re-check Google's current API terms, free-tier quotas and data-use terms. Keep holdings quantities, cost basis, credentials and identity out of model prompts.
