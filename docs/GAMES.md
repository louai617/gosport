# SportGo — casino games

> Credits only. Rounds are decided, charged and settled **on the server**, from a
> seed the player can audit, and recorded in the same ledger as every other
> movement — but the balance is demo credit and no game provider is connected.
> Read `docs/COMPLIANCE.md` alongside this.

---

## 1. Two populations, one catalogue

| | Originals | Provider content |
|---|---|---|
| Where the maths lives | `src/lib/games/` in this repo | The studio's server |
| Playable here | Yes — Crash, Dice, Mines, Plinko, Limbo, Slots, Blackjack, Roulette | **No.** Every title is `unavailable` |
| Provably fair | Yes, `src/lib/provablyFair.ts` | Provider-defined; usually not |
| RTP | Computed and published per game | Provider-defined; the operator does not set it |
| Integration | Native route | `GameProviderAdapter` — nothing connected |

The split matters because the operator's obligations differ. For an original
we own the RNG, the RTP and the settlement, and we must be able to prove all
three. For provider content we own none of them and must not restate them —
which is why `houseEdge`, `rtp`, `minStake` and `maxStake` are `null` on every
provider entry rather than filled with a plausible guess.

## 2. Why no provider is connected

This is not a missing environment variable. Third-party casino content has no
public API, and the gate is commercial and regulatory before it is technical:

1. **A licence covering casino games.** Sports betting and casino are separate
   classes in nearly every regime. Holding one does not grant the other.
2. **A commercial agreement** with the studio, or with an aggregator that has
   one — typically with revenue-share terms and minimum guarantees.
3. **Territory whitelisting on the provider's side.** Availability is scoped
   per game per jurisdiction by *their* licence, not ours. A studio will refuse
   to enable a game in a market it is not cleared for.
4. **Certified RNG and a certified integration**, tested by an accredited
   laboratory (GLI, eCOGRA, BMM, iTech Labs) against the standard the regulator
   names — commonly GLI-19 for RNG games and GLI-33 for live dealer.
5. **Production credentials issued to the licensed entity**, after the above.

This was checked again rather than assumed. Every aggregator that markets an
"API" — SOFTSWISS, Hub88, BGaming, GameTrax, SoftAggregator, Slotegrator — puts
the same gate in front of it: an onboarding call, then credentials. Hub88's
developer docs do document a demo mode (`"currency":"XXX"`), but that is demo
*inside* an integration you have already been onboarded to, not open access.
There is no self-serve tier and no public sandbox.

Open-source HTML5 slot engines do exist on GitHub under MIT, and were
considered. They are toys — a spin animation over `Math.random()`, with no reel
strips, no paytable and no RTP model — so importing one would add a licence
obligation and third-party code while providing none of the parts that make a
slot a slot. Building the maths was both cheaper and better.

No amount of code produces any of that, and nothing here should imply
otherwise. `getGameProvider()` therefore returns an adapter that refuses, and
throws loudly if `GAME_PROVIDER` is set to anything else — a misconfigured name
silently degrading to a no-op is how a deployment ends up believing it is
connected when it is not.

### Who the providers actually are

For the record, so the integration work is scoped against reality rather than
guessed at. Availability in any given market depends on the studio's own
licences and is not something an operator can assume.

| Segment | Studios commonly integrated |
|---|---|
| Slots | Pragmatic Play, Play'n GO, Hacksaw Gaming, Push Gaming, Relax Gaming, Nolimit City, Red Tiger, NetEnt, Thunderkick, ELK Studios, Playson, BGaming |
| Live dealer | Evolution (and its Ezugi brand), Pragmatic Play Live, Playtech Live, Authentic Gaming, Vivo Gaming |
| Crash / instant | Spribe, SmartSoft, Turbo Games, Galaxsys |
| RNG table games | Playtech, Habanero, Betsoft, Evoplay |

Most operators do not integrate these one by one. They integrate **one
aggregator** and receive hundreds of titles behind a single protocol —
SoftSwiss Game Aggregator, EveryMatrix CasinoEngine, Slotegrator, Pariplay,
Hub88 and Relax's Silver Bullet are the usual names. That is the integration
this codebase is shaped for: one `GameProviderAdapter`, many titles.

## 3. The integration shape

Two protocols cover nearly all of them.

**Launch.** The operator exchanges a player session for a short-lived seat
token and receives an iframe URL on the *provider's* origin. The game runs in
their sandbox; the operator does not proxy, rehost or repackage it.

**Seamless wallet.** The provider holds no balance. It calls back into the
operator for every movement, and three properties are non-negotiable — each is
a real way integrations fail in production:

- **`debit` must be idempotent** on round + transaction id. Providers retry on
  timeout, and a non-idempotent debit charges the player twice for one spin.
- **`credit` must not mint balance.** It is an entry in the same append-only
  ledger as everything else, or the wallet stops reconciling.
- **`rollback` must succeed for an unknown transaction.** Providers send
  rollbacks for rounds the operator may have rejected; answering "unknown"
  with an error leaves the round stuck open on their side.

All of this is typed in `src/services/gameProvider.ts` —
`SeamlessWalletCallbacks` is the interface a real deployment implements, and
`verifyCallbackSignature` fails closed, because a wallet-credit endpoint that
cannot authenticate its caller is a free-money endpoint.

## 4. Provably fair

`src/server/casino/fairness.ts` holds a **per-player seed pair on the server** and
implements the standard commit–reveal scheme:

```
serverSeed        32 random bytes, secret, stored in FairnessSeed
serverSeedHash    SHA-256(serverSeed) — shown to the player BEFORE any bet
clientSeed        player-editable
nonce             one atomic increment per round on the pair

bytes  = HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${cursor}`)
float  = b0/256 + b1/256² + b2/256³ + b3/256⁴
```

The server therefore cannot choose an outcome after seeing a bet, and cannot swap
the seed afterwards. When the player **rotates** the pair, the old server seed is
*revealed*: anyone can check that its hash equals the commitment they were shown
and that each past round reproduces from `(serverSeed, clientSeed, nonce)`.

Safeguards that matter:

- The nonce is bumped by a single atomic `UPDATE … increment`, so two concurrent
  rounds can never share a nonce (which would give them identical outcomes). It
  is taken inside the transaction that opens the round, so a round that fails to
  open burns no nonce.
- A pair **cannot be rotated while a round that drew from it is open** — revealing
  the seed mid-round would reveal the Mines board, the crash point or the rest of
  the shoe.
- Four bytes per float, not one: a single byte bands visibly on a multiplier
  curve. A digest yields eight floats; games needing more advance `cursor`.
  Mines and the blackjack shoe shuffle with Fisher–Yates over the same stream
  (`src/lib/games/shuffle.ts`), so the float budget is fixed and a verifier can
  replay it.
- Every settled round stores its proof (`serverSeedHash`, `clientSeed`, `nonce`)
  on the `Bet` row.

`/games/fairness` and the per-game **Fairness** panel show the commitment, let the
player edit the client seed and rotate, list revealed seeds, and re-derive any
round in the browser with `src/lib/provablyFair.ts` — the same byte-to-float
mapping as the server (`scripts/fairness-test.mts` asserts the two agree).

## 5. Game mathematics

One edge constant, `HOUSE_EDGE = 0.01`, and every payout derived from a stated
probability rather than a lookup table.

| Game | Model | Result |
|---|---|---|
| **Dice** | 10 000 uniform outcomes, 0.00–99.99. Win chance is an exact **count**, not a float — a probability off by a hundredth is a house edge off by the same. | 98.9–99.0% |
| **Limbo / Crash** | `result = RTP / u`, u uniform on (0,1]. Gives `P(result ≥ M) = RTP/M` for every M, so the edge is identical whatever multiplier is chosen. | ~99.0% |
| **Mines** | `P(k safe) = C(25−m, k)/C(25, k)`; payout is its reciprocal × RTP. Priced from the identity, so the edge holds for any mine count. | 98.4–99.0% |
| **Plinko** | Binomial buckets; multipliers follow `r^\|i−rows/2\|` scaled to the target RTP, then **rounded to what the player is shown**. | 98.7–99.3% |

Plinko is worth its own note. Rounding the table moves the return, so the true
RTP is recomputed *from the rounded values* and displayed under the board.
Publishing 99% while paying a table that returns 98.73% would be a false
statement — and the kind that survives review precisely because nobody
re-derives it.

Crash's rising curve is `e^{0.18·t}`: the bust point is drawn once, up front,
from the committed seed and kept only on the server. A cash-out is resolved
against the **server's clock**, not a multiplier the browser reports, so the
animation is presentation and cannot move the result. A round the player walks
away from is settled as a loss the next time it is touched.

## 5a. SportGo Reels — the slot

Five reels, three rows, ten fixed paylines. Built here because it could not be
imported; the maths is the real thing rather than a spin animation.

**Odds come from reel strips.** Each reel is a circular 24-position strip and a
spin picks a stop; the window shows three *consecutive* symbols. Drawing three
independent symbols per reel would be a different distribution — adjacency on
the strip is what makes stacked symbols and near-misses behave correctly, and
it is how a physical machine works.

**The RTP is enumerated, not estimated.** 24⁵ = 7 962 624 stop combinations are
evaluated exactly by `scripts/slot-rtp.ts`, which imports the *shipping* engine
under Node's type stripping — a verifier that reimplements the algorithm
verifies nothing. That is also why `src/lib/games/slots.ts` has no imports.

```
base game      73.23%
free spins     23.51%   (trigger 1 in 62 spins)
TOTAL          96.74%   → house edge 3.26%

hit frequency  30.40%
largest win    97.90x the total bet
```

Free spins are folded in analytically — `P(trigger) × spins × baseReturn × 2` —
and retriggers are not awarded, which keeps that term exact and the published
figure honest.

### The number slots do not show you

10.07% of all spins "win" but return **less than the stake**. The reels
celebrate, the balance goes down. That is the industry's *loss disguised as a
win*, and it is a documented driver of continued play.

Two things follow from it here. First, the paytable was designed against it:
three-of-a-kind on the two lowest symbols pays nothing, and the return was moved
into higher tiers. That cut sub-stake "wins" from 25.5% to 10.1% and hit
frequency from 47% to 30% at the same RTP — fewer, more meaningful wins.
Second, the remaining 10.07% is **printed in the game's own paytable panel**
alongside RTP and hit frequency. A machine that hides how often its wins are
losses is not being straight with the player.

## 5b. Server-side settlement

All eight games — dice, limbo, crash, mines, plinko, slots, blackjack, roulette —
settle on the server. The client sends a wager and animates what comes back.

```
POST /api/casino/play      open a round (one-shot games settle immediately)
POST /api/casino/action    continue a round: mines reveal/cash-out, crash cash-out, blackjack hit/stand/double/split
GET  /api/casino/active    the caller's open round for a game (resume after a reload)
GET  /api/casino/history   the caller's settled rounds
GET  /api/casino/fairness  commitment, client seed, revealed seeds (POST rotates the pair, optionally with a new client seed)
```

**Where the authority sits.** `src/server/casino/` owns the wager checks, the
randomness, the payout and the ledger writes. The game *maths* is in the pure
modules under `src/lib/games/`, which the browser also imports — only to render a
result the server has already committed to and to quote odds.

**One transaction per step.** Opening a round runs `assertWagerAllowed`
(maintenance mode, restrictions, self-exclusion, verification gate, stake / loss /
single-bet limits), takes the stake through `appendLedgerEntry`, draws the seed
nonce and writes the `Bet(kind CASINO)` row — together or not at all. Settlement
credits the payout the same way. Each round is a `Bet` with a `version` column
for optimistic locking, so two concurrent actions on one round cannot both win.

**Idempotency.** Every write carries a client-generated key stored in
`IdempotencyRecord` *inside the same transaction*. A retry — or a concurrent
duplicate — returns the original response and moves no money, so a timeout cannot
be used to re-roll a losing spin.

**What the client is never sent.** The blackjack shoe and the dealer's hole card,
the Mines layout and the crash point stay on the server until the round is
settled; with any of them the game is solvable.

**Free spins are server state** (`SlotFreeSpins`): a client-held counter could be
edited for unlimited doubled spins, and the published 96.74% RTP counts free spins
as 23.51 of its points.

**Stakes** are bounded by `GAME_STAKE` and must be whole centimes; the server
re-validates them regardless of what the form offered.

`npm run test:integration` covers the casino end to end: input validation,
settlement against the pure maths and the player's revealed seed, balance
reconciliation after every game, idempotent replay and a six-way race on one key,
double cash-out refusal, crash settled on the server clock and abandoned rounds,
limit and cooling-off enforcement, concurrent bets that cannot overspend, and "no
round left open or half-written". `scripts/fairness-test.mts` pins the
server/browser float derivation.

## 6. Responsible gambling

Casino games are not sports betting with different artwork. A football bet
resolves in ninety minutes; a dice roll in under a second. The same stake and edge
produce losses orders of magnitude faster, which is why regulators commonly
impose stake caps, minimum round durations and session reminders on casino
content that they do not impose on sportsbooks.

What this build does:

- The account-level controls apply to games exactly as to sport, and they are
  **enforced on the server inside every round** (`assertWagerAllowed`): deposit,
  stake, loss and single-bet limits (increases wait out a cooling-off period),
  cooling-off and self-exclusion, and operator restrictions.
- Every game page states plainly that credits are not money, and the lobby says
  how much faster casino play is.
- Stakes are bounded per round.

What a licensed deployment must still add: minimum round duration where the
regulator sets one, session-time limits and reality checks that survive a reload,
and affordability and behavioural monitoring at whatever threshold applies.

## 7. Before any of this could be real

Beyond `compliance.requiredBeforeLaunch`, which now carries
`casino_licence_class` and `certified_rng_and_game_testing`:

- Independent RTP and RNG certification against the published figures (the
  engine, seed handling and ledger exist; no laboratory has examined them).
- A licensed game provider, if third-party content is wanted (see §2–3).
- Real money rails — today credit is recorded by an operator.

### On Tunisia specifically

Online gambling in Tunisia is not an open licensing market. Sports betting is
operated by the state through Promosport, land-based casinos exist under a
separate and narrow permission historically tied to tourist zones, and there is
no established route by which a private operator obtains an online casino
licence. A casino product aimed at this market therefore cannot be launched on
the strength of engineering readiness — it is a legal question first, and one
for local counsel and the competent authority, not for this document.
