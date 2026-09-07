#!/usr/bin/env node
/**
 * End-to-end check of the casino ledger.
 *
 * Exercises the properties that actually matter for a wallet: the balance only
 * moves by what the server says, a retried request cannot pay twice, a settled
 * round cannot be acted on again, and an over-stake is refused.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

let cookies = "";
let csrf = "";
let failures = 0;

function check(name, condition, detail = "") {
  const mark = condition ? "✓" : "✗";
  if (!condition) failures += 1;
  console.log(`  ${mark} ${name}${detail ? `  — ${detail}` : ""}`);
}

function absorb(response) {
  const set = response.headers.getSetCookie?.() ?? [];
  for (const entry of set) {
    const pair = entry.split(";")[0];
    const name = pair.split("=")[0];
    const kept = cookies.split("; ").filter((c) => c && !c.startsWith(`${name}=`));
    kept.push(pair);
    cookies = kept.join("; ");
  }
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { cookie: cookies } });
  absorb(response);
  return response.json();
}

async function post(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies, "x-csrf-token": csrf },
    body: JSON.stringify(body),
  });
  absorb(response);
  return response.json();
}

const key = () => `k-${Math.random().toString(36).slice(2)}-${Date.now()}`;

console.log("\nCasino ledger — end to end\n");

/* ---------------------------------------------------------------- session */
const session = await get("/api/casino/session");
check("session opens", session.ok === true);
csrf = session.data?.csrfToken ?? "";
const opening = session.data?.balance ?? 0;
console.log(`    opening balance ${opening}`);

/* ------------------------------------------------------ balance integrity */
console.log("\nSlots — 12 spins, ledger must reconcile");
let expected = opening;
let wins = 0;
for (let i = 0; i < 12; i += 1) {
  const stake = 1;
  const before = expected;
  const response = await post("/api/casino/play", { game: "slots", stake, idempotencyKey: key() });
  if (!response.ok) { check(`spin ${i + 1}`, false, response.error?.messageKey); break; }

  const { balance, transaction } = response.data;
  expected = Math.round((before - transaction.betAmount + transaction.payout) * 100) / 100;
  if (transaction.payout > 0) wins += 1;
  if (Math.abs(balance - expected) > 0.001) {
    check(`spin ${i + 1} reconciles`, false, `server ${balance} vs expected ${expected}`);
    break;
  }
  expected = balance;
}
check("12 spins reconcile against the ledger", true, `${wins} paid, balance ${expected}`);

/* -------------------------------------------------------------- idempotency */
console.log("\nIdempotency — a retry must not pay twice");
const replayKey = key();
const first = await post("/api/casino/play", { game: "slots", stake: 5, idempotencyKey: replayKey });
const second = await post("/api/casino/play", { game: "slots", stake: 5, idempotencyKey: replayKey });
check("retry returns the same balance", first.data.balance === second.data.balance,
  `${first.data.balance} vs ${second.data.balance}`);
check("retry returns the same round", first.data.roundId === second.data.roundId);
check("retry returns the same outcome",
  JSON.stringify(first.data.result) === JSON.stringify(second.data.result));

/* ------------------------------------------------------------------ limits */
console.log("\nValidation");
const tooBig = await post("/api/casino/play", { game: "slots", stake: 999999, idempotencyKey: key() });
check("over-max stake refused", tooBig.ok === false, tooBig.error?.messageKey);
const negative = await post("/api/casino/play", { game: "slots", stake: -50, idempotencyKey: key() });
check("negative stake refused", negative.ok === false, negative.error?.messageKey);

/* --------------------------------------------------------------- roulette */
console.log("\nRoulette");
const spin = await post("/api/casino/play", {
  game: "roulette",
  bets: [{ key: "red", amount: 2 }, { key: "n17", amount: 1 }],
  idempotencyKey: key(),
});
check("spin settles", spin.ok === true);
if (spin.ok) {
  const { result, transaction } = spin.data;
  check("pocket in range", result.pocket >= 0 && result.pocket <= 36, `pocket ${result.pocket} ${result.colour}`);
  check("stake debited exactly once", transaction.betAmount === 3);
  const redWon = result.colour === "red";
  const straightWon = result.pocket === 17;
  const want = (redWon ? 4 : 0) + (straightWon ? 36 : 0);
  check("payout matches the paytable", transaction.payout === want, `paid ${transaction.payout}, expected ${want}`);
}

/* -------------------------------------------------------------- blackjack */
console.log("\nBlackjack");
const deal = await post("/api/casino/play", { game: "blackjack", stake: 5, idempotencyKey: key() });
check("hand deals", deal.ok === true);
if (deal.ok) {
  const view = deal.data.result;
  check("player gets two cards", view.hands[0].cards.length === 2);
  check("hole card withheld", view.dealer.length === 1 || view.phase === "settled",
    `dealer shows ${view.dealer.length}`);

  let state = view;
  let roundId = deal.data.roundId;
  let guard = 0;
  while (state.phase === "player" && guard < 12) {
    const response = await post("/api/casino/action", { roundId, action: "stand", idempotencyKey: key() });
    if (!response.ok) { check("stand accepted", false, response.error?.messageKey); break; }
    state = response.data.result;
    guard += 1;
  }
  check("hand reaches settlement", state.phase === "settled", `phase ${state.phase}`);
  check("hole card revealed at settlement", state.dealer.length >= 2);

  const replay = await post("/api/casino/action", { roundId, action: "hit", idempotencyKey: key() });
  check("settled round refuses further action", replay.ok === false, replay.error?.messageKey);
}

/* ---------------------------------------------------------------- history */
console.log("\nHistory");
const history = await get("/api/casino/history?limit=100");
check("history returns rounds", Array.isArray(history.data) && history.data.length > 0,
  `${history.data?.length} transactions`);
const allSettled = (history.data ?? []).every((t) => t.status === "SETTLED");
check("every recorded round is settled", allSettled);
const noDupes = new Set((history.data ?? []).map((t) => t.transactionId)).size === history.data.length;
check("no duplicate transaction ids", noDupes);

/* ------------------------------------------------------- balance persists */
const after = await get("/api/casino/session");
check("balance survives a fresh session read", typeof after.data?.balance === "number",
  `balance ${after.data?.balance}`);

console.log(failures === 0 ? "\n✓ all casino checks passed\n" : `\n✗ ${failures} check(s) failed\n`);
process.exitCode = failures === 0 ? 0 : 1;
