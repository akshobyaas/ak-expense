# Ledger — motorcycle ownership & expense tracker

A premium, dark, mobile-first ledger for everything the bike costs, built the same way as [vault](https://github.com/akshobyaas/vault): **vanilla JS + one Vercel function + a Google Sheet you own**. There's no framework and no build step.

It's a proper ledger. Every figure is calculated from records, and each record keeps where it came from.

## Structure

```
ak-expense/
├── index.html            UI shell + design system (CSS tokens)
├── app.js                views, router, storage (Sheet or this device)
├── ledger.js             pure reconciliation engine — all money logic, integer paise
├── seed.js               known history, transcribed as given (no invented data)
├── api/ledger.js         Vercel function → Google Sheets / Drive (no delete endpoint)
├── test/ledger.test.js   18 tests incl. the 10 required cases   → npm test
├── vercel.json           security headers / CSP
└── manifest.webmanifest  add-to-home-screen
```

## Data model (Sheet tabs, auto-created on first import)

**Transactions**: id, kind (`transaction` | `line_item`), parent_id, expenditure, amount, date (blank = unknown), notes, category, subcategory, source, source_reference, order_reference, status, verified, installed (blank = unknown), duplicate_of, related, odometer_km, attachment_url, created_at, updated_at

**Refunds**: id, transaction_id, amount, date, notes, created_at

**Meta**: key / value (reportedBaseline, countUnverified, countNeedsReview)

## Rules the engine enforces

- `NET = Σ (amount − refunds)` over rows that are `kind = transaction`, not a duplicate, and have a counted status.
- **Line items never count.** The order total is the money; line items are supporting detail.
- **Duplicates are kept and linked** (`duplicate_of`), and they're excluded from totals. A new duplicate always links to the original record, never to another duplicate.
- **Refunds are separate rows.** REFUNDED and PARTIALLY REFUNDED are worked out from them and never typed in by hand.
- **Dates are never invented.** Undated records sort last and are left out of monthly charts, and the charts say so.
- **The ₹1,01,167 baseline is kept as a reported number.** The ₹8,498 not itemised here is shown as a gap and is never back-filled.
- **Nothing is deleted.** The API has no delete endpoint.
- **Cost per km stays hidden until real odometer readings exist.**

## Deploy

1. Create a new, empty Google Sheet and copy its ID.
2. Push this folder to a new GitHub repo, then import it in Vercel.
3. Set the env vars from `.env.example`. You can reuse the vault's Google client ID, secret and refresh token, but use a **different** `VAULT_API_KEY`.
4. Open the site, go to **Data & settings**, paste the key, then tap **Import known history into an empty Sheet**. The import is refused if the Sheet already has rows.

Until a key is set, the app runs entirely on the device (localStorage), pre-loaded with the known history. That's handy for trying it out before you connect the Sheet.

## Local

```
npm test                 # ledger engine tests
python3 -m http.server   # UI in device-only mode (the API needs `vercel dev`)
```
