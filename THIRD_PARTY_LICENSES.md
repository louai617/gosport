# Third-party licences

Software incorporated into SportGo that is authored by someone else, with the
notices its licence requires.

---

## casino-by-ai — Lemelson

**Upstream:** https://github.com/Lemelson/casino-by-ai
**Licence:** MIT

### What is used

Game *rules* only, adapted into this codebase's architecture:

| Where | What was taken |
|---|---|
| `src/lib/games/roulette.ts` | European wheel pocket order, the red-number set, the bet predicates (`betWins`) and the payout multipliers, from `src/scenes/roulette.js` |
| `src/lib/games/blackjack.ts` | Hand valuation with ace demotion, the four-deck shoe, the split/double rules, dealer-stands-on-soft-17 and the settlement table, from `src/scenes/blackjack.js` |

### What is not used

The upstream canvas engine, pixel font, palette, scene manager, audio, sprite
art, `Math.random()` RNG and localStorage wallet are **not** included. This
application renders in React, resolves outcomes on the server with a CSPRNG,
and holds balances in a server-side ledger.

Its slots and plinko implementations are also not used — SportGo had its own
with reel strips and enumerated RTP before this integration.

### How it was adapted

The upstream rules run in the browser, mutate a localStorage balance and read
`Math.random()` directly. Both ported modules were rewritten as pure,
state-free TypeScript with randomness injected by the caller, so the same code
can resolve a round on the server and animate it on the client without the
client being able to influence the outcome.

### Licence

MIT License

Copyright (c) 2026 Lemelson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
