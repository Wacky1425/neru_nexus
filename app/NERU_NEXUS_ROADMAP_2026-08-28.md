# Neru Nexus Development Roadmap

Updated: 2026-08-28

## Current release status

- Ver.1: `██████████ 100%`
- V1.1: `██████████ 100%` — implementation and user confirmation complete

## Completed V1.1

### V1.1-1 Asset snapshots / trend
Status: `██████████ 100%`

- Daily asset snapshots
- Net asset trend chart
- 6 months / 1 year / all range switching
- Cash / investment / other asset breakdown
- Manual snapshot and daily automatic snapshot

### V1.1-2 Streaming / side-business report
Status: `██████████ 100%`

- Annual sales, expenses, deductible expenses and profit
- Profit margin / effective expense ratio / evidence coverage rate
- Monthly sales / expense / profit trend
- Best / worst month
- Missing evidence list
- Tax CSV export

### V1.1-3 SBI Sumishin Net Bank CSV
Status: `██████████ 100%`

- `sbi_netbank_v1` auto detection
- CP932 / Shift_JIS import through Flutter
- Income / expense normalization
- Import History / duplicate prevention / classification integration
- Own-name transfer detection
- Real CSV import confirmed
- Regression fixture newline issue fixed

### V1.1-4 Recurring / subscription management
Status: `██████████ 100%`

- Expected payment day estimation
- Monthly and annual estimates
- Remaining recurring payments for current month
- Overdue expected-payment detection
- Home forecast compatibility

---

# Next roadmap

## V1.2 — Reduce manual input
Status: `██████████ 100%`

Goal: move Neru Nexus from “a finance app you enter data into” toward “a finance app that records and organizes most data automatically.”

### V1.2-1 Stability / known-debt cleanup
Status: `██████████ 100%`

- [Implemented] Fix new transaction creation for `移動` / transfer semantics across Flutter + GAS
- [Implemented] Send and persist `fromAccount` / `toAccount` on manual transfer creation
- [Implemented] Reject same source/destination account on transfer creation
- [Implemented] Add Flutter regression coverage for transfer-create request payload
- [Implemented] Clean the five known `unnecessary_underscores` Flutter analyze infos
- Reconfirm transaction semantics across manual / CSV / Gmail inputs
- Review duplicate / transfer / card settlement edge cases
- Review plugin / Kotlin future-compatibility warnings
- Keep release checks green before adding more automation

### V1.2-2 Merchant auto-classification + rule management
Status: `██████████ 100%`

- [Implemented] Keep `M_Rules` as the single source of truth
- [Implemented] App-side classification rule list / create / edit / delete
- [Implemented] equals / starts_with / contains rule editing
- [Implemented] Category / purpose / expense-ratio editing
- [Implemented] Derive merchant suggestions from confirmed transaction history
- [Implemented] Require at least 2 matching confirmations and 75% consistency
- [Implemented] Show evidence count and confidence for each suggestion
- [Implemented] One-tap promotion from suggestion to `M_Rules`
- [Implemented] Existing exact merchant rules are excluded from suggestions
- [Verification] Run release checks and confirm rule management on device

### V1.2-3 Gmail receipt / evidence intake
Status: `██████████ 100%`

- [Implemented] Scan Gmail for receipt / invoice / purchase-confirmation messages
- [Implemented] Extract amount, date and merchant conservatively
- [Implemented] Create `T_GmailEvidenceCandidates` automatically
- [Implemented] Deduplicate candidates by Gmail message ID
- [Implemented] Propose matching expense transactions using exact amount + date proximity + merchant similarity
- [Implemented] Keep ambiguous / unmatched messages for review instead of auto-linking
- [Implemented] App page for scan / candidate review / evidence attach / ignore
- [Implemented] Store Gmail thread permalink in `evidence_url` after explicit approval
- [Implemented] Never overwrite an existing different evidence URL
- [Implemented] Daily Gmail evidence candidate scan trigger installed by release checks
- [Implemented] Parser / matching regression test
- [Verification] Real Gmail receipts from actual services still need live-format validation

### V1.2-4 Receipt OCR
Status: `░░░░░░░░░░ 0%`

- Import receipt photo
- Extract merchant / date / amount
- Match against existing transactions
- Attach as evidence when matched
- Create a transaction candidate when no match exists

---

## V1.3 — Asset / investment / business automation
Status: `░░░░░░░░░░ 0%`

### Planned

- SBI Securities notification / Gmail parser
- Buy / sell event detection
- Automatic holding quantity updates
- Price / NAV refresh and valuation update
- Separate net asset growth into contributions vs investment return
- Stronger business / tax preparation workflow
- Better annual streaming-business summary

---

## V1.4 — Financial decision support
Status: `░░░░░░░░░░ 0%`

### Planned

- Month-end balance forecast
- Safe cash until payday
- Card payment forecast
- Spending anomaly detection
- Category overspending detection
- Subscription increase detection
- Suggested additional NISA allocation
- Home screen recommendations: “what to do next”

---

## V2.0 — Architecture refresh
Status: `░░░░░░░░░░ 0%`

Do not start until V1.x usage reveals an actual need.

### Candidates

- Full Category ID migration
- Full Account ID migration
- API v2 strategy
- Authentication redesign
- Backend database migration evaluation
- Reduce dependence on spreadsheet structure

---

# Operational validation backlog

These are not current release blockers, but should remain visible.

- Gmail preliminary → formal CSV reconciliation over additional real billing cycles
- Credit-card settlement behavior with future real data
- SBI Securities actual buy / settlement / recurring-investment notification samples
- Investment market-price provider coverage, especially mutual funds
- Side-business automatic classification with more real transactions

---

# Recommended next action

V1.2 is complete; receipt OCR was intentionally removed from scope. V1.3-1 SBI Securities Gmail integration is implemented and awaiting real-mail validation. Deploy GAS, run `runReleaseChecks()`, run Flutter tests/analyze, then open **投資ポートフォリオ → SBI証券通知** and scan the past 90 days. If real SBI buy/sell mail is parsed correctly, apply one event and verify the holding quantity. If the actual mail format differs, adjust only the parser while keeping the event/review/apply pipeline unchanged.