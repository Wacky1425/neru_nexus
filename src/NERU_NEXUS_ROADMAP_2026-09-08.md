# Neru Nexus Roadmap — 2026-09-08 — V2.1

```text
V1.x 機能開発                  ██████████ 100%
V2.0 内部構造刷新              ██████████ 100%
V2.1 実用性強化                █████░░░░░  50%

V2.1-1 Home予測精度            █████████░  90%
V2.1-2 SBI投資連携安定化       █████████░  90%
V2.1-3 Investment Dashboard    █████████░  90%
V2.1-4 Investment Planner      ░░░░░░░░░░   0%
V2.1-5 Investment Suggestion   ░░░░░░░░░░   0%
```

## V2.1-3 Investment Dashboard

Implemented:

- Existing registered holdings remain the source of truth.
- Yahoo-backed holdings now persist:
  - current price / NAV
  - previous close
  - absolute daily price change
  - daily change rate
  - price update timestamp
- Existing `M_InvestmentHoldings` is extended automatically with:
  - `previous_close`
  - `price_change`
  - `price_change_rate`
- No manual spreadsheet migration is required.
- Portfolio API now returns:
  - total market value
  - total acquisition cost
  - unrealized P/L and rate
  - total previous-day change and rate
  - holding portfolio weights
  - price-data coverage
  - latest price update time
- Flutter portfolio summary displays previous-day portfolio movement.
- Each holding displays:
  - current price, or 基準価額 for fund holdings
  - previous-day price movement
  - unrealized P/L
  - portfolio weight
  - price freshness
- Funds are labeled 基準価額 rather than presenting them as intraday stock prices.
- Holdings without previous-close data show `未取得` rather than a fabricated 0% movement.
- `verifyV213InvestmentDashboard()` validates the new storage columns.
- `runReleaseChecks()` includes the V2.1-3 verifier.
- Regression coverage added for aggregate daily change and portfolio weights.
- Flutter model parsing test added.

Final verification:

1. Deploy GAS.
2. Run `runReleaseChecks()`.
3. Replace Flutter.
4. Run `flutter pub get`.
5. Run `flutter test`.
6. Run `flutter analyze`.
7. Open 投資ポートフォリオ and press price refresh once.
8. Confirm registered Yahoo-backed holdings show price/NAV, previous-day movement, unrealized P/L and weight.

Important:
- A holding must already be registered in Neru Nexus.
- Automatic market movement requires a valid Yahoo Finance symbol and `price_provider=yahoo`.
- Manual-price holdings remain supported but do not invent previous-day movement.
- Currency conversion for foreign-currency securities is not added in this phase; existing valuation currency semantics are preserved.

## Next — V2.1-4 Investment Planner

Planned:
- monthly investable amount derived from Neru Nexus household cash safety
- investment plans by holding
- NISA planned allocation
- planned vs actual
- SBI execution-event reconciliation against plans
- no securities order submission from Neru Nexus

## Then — V2.1-5 Investment Suggestion

Planned:
- household surplus
- emergency-cash boundary
- NISA capacity
- portfolio weights
- investment plan progress
- market movement
- actionable planning suggestions without automatically placing trades
