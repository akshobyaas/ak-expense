# Ixora

A small, fast expense tracker for **Ixora**, Akshobya A S's London Red Royal Enfield Hunter 350.
Log fuel, service and parts from your phone; everything is saved to a Google Sheet you own.

Live: https://expense8849.vercel.app

## How it's built

Plain HTML/CSS/JS, one Vercel function, a Google Sheet. No framework, no build step.

```
index.html            page shell + styles
app.js                screens: Home, Expenses, Stats, Add/Edit, More
ledger.js             all the money maths (integer paise), shared with the tests
api/ledger.js         Vercel function → Google Sheets (read / add / edit / delete)
data/seed.js          the audited history (Feb–Sep 2026), backend only
data/migrations/      one-off data updates, already applied, kept for the record
scripts/push.mjs      load or update Sheet data from your computer
test/ledger.test.js   automated checks  →  npm test
```

`data/`, `scripts/` and `test/` are never deployed (`.vercelignore`), so your history isn't public.

## Everyday use

- **Add** an expense: amount, category, what it was (or litres, full/partial and the place for fuel), date.
- Tap any expense to **edit** or **delete** it. Deleting removes it from the Sheet for good, with its order lines and refunds.
- **Home** shows the total, where the money went and recent entries. **Expenses** has search and category filters with a running total. **Stats** has monthly charts.
- If you log something that's already there, the app asks before adding it again.

## How the total is worked out

- Total = what you paid − refunds.
- An online order counts once (its order total); the items inside it are details, never added again.
- A second record of the same purchase is marked as a duplicate and not counted.
- Dates are never made up — undated expenses still count, they just don't appear in the monthly chart.
- The old expense app's ₹1,01,167 is fully accounted for: its 54 entries + the HRZ invoice (₹8,498).

## Setup (only needed again on a new Sheet)

1. Vercel → Settings → Environment Variables, from `.env.example`.
2. From this folder (reads `VAULT_API_KEY` from `.env.local`):
   ```
   node scripts/push.mjs data/seed.js --apply                  # empty sheet only
   node scripts/push.mjs data/migrations/<file>.json --apply   # each migration, in order
   ```
   Leave off `--apply` to preview first.
3. Open the app → your initials (top right) → paste the vault key → Connect.

## Local

```
npm test
python3 -m http.server   # UI only, saves to this browser
```
