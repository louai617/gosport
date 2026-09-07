# SportGo — casino games

> Everything in this section is simulated. Balances are session numbers in the
> browser, rounds are computed client-side, and no wager, credit or provider
> call is real. Read `docs/COMPLIANCE.md` alongside this.

---

## 1. Two populations, one catalogue

| | Originals | Provider content |
|---|---|---|
| Where the maths lives | `src/lib/games/` in this repo | The studio's server |
| Playable here | Yes — Crash, Dice, Mines, Plinko, Limbo | **No.** Every title is `unavailable` |
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

`src/lib/provablyFair.ts` implements the standard commit–reveal scheme:

```
serverSeed        32 random bytes, secret
serverSeedHash    SHA-256(serverSeed) — published before any bet
clientSeed        player-supplied, editable at any time
nonce             increments per round

bytes  = HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${cursor}`)
float  = b0/256 + b1/256² + b2/256³ + b3/256⁴
```

Four bytes per float, not one: a single byte gives 256 distinct outcomes and
bands visibly on a multiplier curve. A digest yields eight floats; games needing
more advance `cursor`, so the stream is unbounded and still traces to one seed.
Mines shuffles all 25 tiles with Fisher–Yates over the same stream rather than
drawing positions independently, which would collide and need rejection —
breaking the fixed float budget a verifier depends on.

`/games/fairness` re-derives any round from pasted seeds, using the same
functions the games use and no privileged access at all.

> **What this build does not prove.** The arithmetic is the real scheme and
> verifies correctly. The *guarantee* is absent: with no server, the seed is
> generated in the player's own browser, so nothing was committed to by a party
> that could not also change it. Provably fair means something only when the
> server generates the seed, publishes the hash before the bet, and computes
> the outcome server-side. The fairness panel and the verifier page both say so
> on screen — a fairness badge without that caveat is the exact
> misrepresentation the badge exists to prevent.

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
from the committed seed. The animation is presentation and cannot move it.

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

## 6. Responsible gambling

Casino games are not sports betting with different artwork, and the product
should not treat them as if they were.

A football bet resolves in ninety minutes. A dice roll resolves in under a
second. The same stake, the same edge and the same player produce losses orders
of magnitude faster, and the loss-chase loop is far tighter — which is why
regulators commonly impose stake caps, minimum spin durations and mandatory
session reminders on casino content that they do not impose on sportsbooks.

What this build does:

- The lobby states the speed difference in the first disclosure a player reads.
- Every board carries the simulation notice **above** the stake field.
- The existing limit, cooling-off and self-exclusion controls cover games as
  well as sport, because they are account-level and always were.

What a licensed deployment must add:

- Per-spin stake caps and a minimum round duration, where the regulator sets one.
- Loss and session limits **enforced server-side on the game endpoint** — a
  limit the UI merely displays is not a limit.
- `assertNotSelfExcluded` on the launch and settlement path, not only on the
  sportsbook's.
- Reality-check interrupts that survive a page reload.
- Affordability and behavioural monitoring, at whatever threshold applies.

## 7. Before any of this could be real

Beyond `compliance.requiredBeforeLaunch`, which now carries
`casino_licence_class` and `certified_rng_and_game_testing`:

- Server-side game engine. `gamesService.placeRound()` deliberately refuses:
  trusting a browser-reported outcome is the most exploitable thing a casino
  backend can do, and a stub that "just records it for now" is how that reaches
  production.
- Server-held seeds with per-player rotation history.
- Game rounds in the same append-only ledger as bets and transactions.
- Independent RTP verification against the published figures.

### On Tunisia specifically

Online gambling in Tunisia is not an open licensing market. Sports betting is
operated by the state through Promosport, land-based casinos exist under a
separate and narrow permission historically tied to tourist zones, and there is
no established route by which a private operator obtains an online casino
licence. A casino product aimed at this market therefore cannot be launched on
the strength of engineering readiness — it is a legal question first, and one
for local counsel and the competent authority, not for this document.
