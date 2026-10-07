# SportGo — regulatory posture and pre-launch gates

This document exists so that nobody reading the code mistakes a demonstration
for a product that may lawfully take bets.

## What this build is

A working platform on **demo credits**: player and administrator accounts, a
credit ledger, a sportsbook and eight casino games that settle on the server,
responsible-gambling controls enforced server-side, an administration console and
an immutable audit trail. Accounts, balances, bets and transactions are real
database records.

## What this build is not

- It is **not licensed** to offer gambling services in Tunisia or in any other
  jurisdiction. `compliance.licence` in `src/config/app.config.ts` is `null` and
  must stay null until a licence actually exists. No licence number, regulator
  name or certification mark appears anywhere in the codebase.
- It does **not** verify anyone's age or identity. The registration form asks the
  user to confirm they are of legal age — a self-declaration, as
  `src/lib/validation.ts` says. `kycStatus` is a **manual decision by an
  operator**; no provider is connected. It must never be presented as
  verification.
- It does **not** process payments. A player cannot deposit. An administrator
  *records* credit (with a reason, audited, and above a threshold approved by a
  second administrator); a withdrawal request holds the funds and an administrator
  marks it paid after the operator has paid out of band. No provider credential
  exists in the repo.
- It does **not** use a live odds feed. Events, markets and odds come from a
  deterministic dataset (`src/data`). Tickets are priced and settled on the server
  from that dataset, and an administrator settles them per leg.
- It has **no e-mail transport and no two-factor authentication**.
- Every balance is demo credit and is labelled as such where it is displayed.

## Gates that must close before `NEXT_PUBLIC_APP_MODE=live`

These mirror `compliance.requiredBeforeLaunch`. The responsible-gambling page
renders this list from that constant, so the two cannot drift.

| Gate | What it means in practice |
|---|---|
| `gambling_licence` | A licence from the competent authority for the target market, held by the operating entity, with the permitted product scope confirmed in writing. |
| `age_verification_provider` | A provider that verifies age against an authoritative source **before** first deposit and before first wager. A checkbox is not verification. |
| `kyc_aml_provider` | Identity verification, document checks, ongoing monitoring, suspicious-activity reporting, transaction thresholds and record retention per the applicable AML regime. |
| `sanctions_pep_screening` | Screening at onboarding and on an ongoing basis. |
| `licensed_payment_provider` | A PCI-DSS compliant PSP using hosted fields or redirect. SportGo must never receive card data. Chargeback and refund flows defined. |
| `national_self_exclusion_register` | Integration with the jurisdiction's register, both directions: honour existing exclusions at onboarding and login, publish new ones. |
| `player_funds_segregation` | Player balances held separately from operating funds, with the protection level the licence requires. |
| `advertising_and_promotion_review` | Every promotion, bonus term and marketing surface reviewed against the local advertising code — including the prohibition on targeting minors and on implying that betting is a way to make money. |
| `data_protection_registration` | Registration with the national data-protection authority, a lawful basis for each processing purpose, a retention schedule, DSR handling, and a DPIA covering profiling and behavioural monitoring. |
| `tax_and_reporting_integration` | Gaming duty calculation and periodic regulatory reporting. |
| `casino_licence_class` | Casino games are a **separate licence class** from sports betting in nearly every regime. A sports-betting permission does not extend to them, and the two must be held separately. |
| `certified_rng_and_game_testing` | RNG and every individual game certified by an accredited laboratory (GLI-19 for RNG titles, GLI-33 for live dealer being the usual standards), with published RTP independently verified. |
| `certified_odds_and_settlement_engine` | Pricing and settlement performed by a certified engine fed by a licensed data source. Today the server prices from a built-in dataset (`bettingService`, `lib/settlement.ts`) and the client calculation in `src/lib/betting.ts` is display-only. |
| `independent_platform_audit` | Third-party audit of the platform, RNG (if any), settlement correctness and security posture. |

## Tunisian market preparation (structural, not a legal claim)

The configuration layer is already shaped for the market. None of this asserts
that operating here is permitted.

- **Currency** `TND`, with the correct **three** minor digits: money is stored as
  integer **millimes** (`BigInt`, 1 TND = 1000). Display rounds to two for
  readability; the ledger does not.
- **Locale** default `fr`, with `ar` (RTL) and `en` alongside. Arabic is a
  first-class direction throughout, not a mirrored afterthought.
- **Timezone** `Africa/Tunis`, applied by every date formatter so a 20:00
  kick-off reads 20:00 regardless of where the server runs.
- **Phone** `+216`, 8 national digits, validated by
  `JURISDICTION.phonePattern` and normalised to E.164.
- **Legal age** `18`, read from configuration rather than hard-coded, so a
  different jurisdiction only changes one file.
- **Competitions** the fixture catalogue leads with Ligue Professionnelle 1,
  Ligue Professionnelle 2, Coupe de Tunisie and the CAF competitions.

To re-point the product at another market, change `JURISDICTION` in
`src/config/app.config.ts` and add the locale. Nothing in feature code reads a
currency, a timezone or an age limit directly.

## Casino games carry a heavier obligation than sport

Added in `docs/GAMES.md`, restated here because it changes the compliance
posture rather than only the feature set:

- A football bet resolves in ninety minutes; a dice roll resolves in under a
  second. The same stake and the same edge produce losses orders of magnitude
  faster, and the loss-chase loop is far tighter. Regulators commonly impose
  stake caps, minimum round durations and mandatory session interrupts on
  casino content that they do not impose on a sportsbook.
- No third-party game provider is connected, and none can be: studio content
  requires a casino licence, a commercial agreement, per-territory whitelisting
  on the provider's side, certified RNG and credentials issued to the licensed
  entity. `src/services/gameProvider.ts` refuses rather than pretending.
- The in-house originals draw from a **server-held, committed seed** the player
  can rotate and verify (`docs/GAMES.md` §4), and settle on the server. No
  independent laboratory has certified the RNG or the published RTPs, which a
  licence would require.
- **On Tunisia specifically:** online gambling is not an open licensing market.
  Sports betting is state-operated through Promosport, land-based casinos sit
  under a separate and narrow permission, and there is no established route by
  which a private operator obtains an online casino licence. A casino product
  for this market is a legal question before it is an engineering one.

## Responsible gambling is a product surface, not a footer link

Enforced on the server inside every wagering path (`assertWagerAllowed` in
`src/services/responsibleService.ts`), in the same transaction that takes the
stake — sportsbook and casino alike:

- **Deposit, stake, loss and single-bet limits** (daily / weekly / monthly), measured
  against the ledger itself, never a stored counter.
- **A limit decrease applies immediately; an increase waits** out
  `responsible.limitIncreaseCoolingOffHours` (a setting, default 24 h) and is
  recorded as pending. The asymmetry is deliberate.
- **Cooling-off** (1, 3, 7 or 30 days) and **self-exclusion** (6, 12, 24 months).
  A self-excluded player can still sign in, see their account and withdraw, but
  cannot wager.
- **Operator restrictions** (`wageringBlocked`, `withdrawalsBlocked`), suspension,
  maintenance mode and an optional "verification required to wager" gate.
- Administrators can see open cases (players with active exclusions, restrictions or limits)
  (**Admin → Responsible gambling**); every change is audited.

**Not implemented:** session-time limits, reality-check interrupts, affordability
and behavioural monitoring, and the national self-exclusion register. A licensed
deployment would be expected to add them.
