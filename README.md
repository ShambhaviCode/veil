<<<<<<< HEAD
# VEIL — Speak up. Stay private.

A privacy-preserving campus incident reporting platform. Reporters prove
they're eligible to report (a verified student/faculty member) without
revealing who they are, then use a pseudonymous identity to submit and track
a report and communicate with administrators.

**Identity → Eligibility → Report → Verification** — kept separate at every
layer.

## What's in this build

This is a complete, runnable full-stack demo of the entire workflow
described in the hackathon writeup:

- **Reporter flow**: eligibility verification (client-side commitment
  hashing — your raw ID/secret never leaves the browser), pseudonym
  issuance, report submission, status tracking, two-way anonymous
  messaging with administrators.
- **Admin flow**: report queue, status updates (submitted → under review →
  info requested → resolved/closed), messaging reporters, viewing each
  report's audit trail. Reporters appear only as pseudonyms — never an
  underlying identity.
- **Public verification**: anyone can check that a report's audit trail is
  intact (hash-chained, tamper-evident) without seeing its content.
- **Compact contract sketch** (`contracts/report_verification.compact`):
  the real on-chain circuit this demo's eligibility check and audit chain
  are modeled after.

## What's real vs. what's simulated — please read this

This sandbox environment has **no network access to a Midnight testnet,
node, or wallet extension** (egress is restricted to package registries
like npm/pypi/crates, not blockchain RPC endpoints), and no Compact
compiler installed. So I could not deploy an actual Compact contract or
wire up real Lace wallet / DApp connector infrastructure here.

What I built instead runs the **same logic shape** server-side in plain
Node, so the whole workflow is genuinely functional end-to-end:

| Concept | Real Midnight version | This demo |
|---|---|---|
| Eligibility proof | Compact circuit proves ZK Merkle-membership of a hashed credential, verified on-chain | Server checks a client-computed SHA-256 commitment against a known set (membership check happens server-side, not in zero knowledge) |
| Pseudonymous identity | Wallet-derived unlinkable credential | Randomly generated pseudonym + session token, held in browser memory only |
| Audit trail | On-chain, tamper-evident by construction (consensus) | Hash-chained log in a JSON file — same linkage logic, but integrity rests on the server, not a distributed ledger |
| Report content | Kept off-chain always (this was true in the original build too) | Stored in a local JSON file (`data/store.json`) |

Porting this to a real deployment means: compiling
`report_verification.compact` with the Midnight Compact compiler, deploying
it to Midnight testnet/mainnet, replacing the `/api/verify-eligibility` and
`appendAuditEvent` logic in `server.js` with calls into Midnight's
TypeScript SDK (proof generation + on-chain submission via a connected
Lace wallet), and moving report content into a proper encrypted
off-chain store keyed by the same report ID used on-chain.

## Running it

No build step, no dependencies beyond Node itself.

```bash
node server.js
```

Then open `http://localhost:8787`.

The server prints the demo admin token and four seeded "eligible"
credentials on startup:

```
STU-10234 / maple-river
STU-88823 / copper-fox
STU-55190 / quiet-harbor
FAC-00019 / granite-owl
```

Use any one of those pairs on the **Reporter → Verify Eligibility** screen.
Anything else is correctly rejected as ineligible.

### Try the flow

1. **Reporter** tab → verify with a demo credential → note your pseudonym.
2. Submit a report.
3. **Admin** tab → sign in with the printed admin token → see the report
   under its pseudonym only → update status / send a message / view its
   audit trail.
4. Back in **Reporter** → see the admin's reply, respond.
5. **Verify a Report** tab → paste the report ID → confirm the chain is
   intact, with zero content exposed.

## Project structure

```
veil/
  server.js                        # API + static file server, zero deps
  data/store.json                  # created on first run
  public/
    index.html
    style.css
    app.js                         # reporter/admin/verify views, client-side hashing
  contracts/
    report_verification.compact    # target Compact circuit design
  README.md
```

## Known simplifications (by design, given scope)

- Admin auth is a single shared token, not per-admin institutional SSO.
- The eligibility "set" is a small hardcoded demo list, not a live
  institution-managed Merkle tree.
- No evidence file upload (only a text note) — the writeup lists encrypted
  evidence management as a "what's next" item, not part of the MVP.
- Single institution only — multi-institution/cross-verification is also a
  "what's next" item in the original writeup.
=======
# veil
>>>>>>> ad9062e283ac74424bc0b56e22d5371527f1d0e4
