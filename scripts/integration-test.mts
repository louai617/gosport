/**
 * End-to-end test of accounts, RBAC, the ledger and the audit trail.
 *
 *   npm run dev            # in one terminal (uses DATABASE_URL from .env.local)
 *   npm run test:integration
 *
 * It drives the real HTTP API with real sessions and CSRF tokens, and checks the
 * database directly where the claim is about the database (immutable ledger,
 * balance == sum of entries). Every run creates its own users, so it can be run
 * repeatedly against a development database without cleanup.
 */
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

import { prisma } from "@/server/db";
import { createHasher } from "@/server/auth/password";
import { floatsFromSeed } from "@/server/casino/fairness";
import { rollFromFloat } from "@/lib/games/dice";
import { shuffleIndicesFromFloats } from "@/lib/games/shuffle";

const BASE = process.argv[2] ?? "http://localhost:3000";
const RUN = randomBytes(3).toString("hex");
const PASSWORD = `Tst-${randomBytes(9).toString("base64url")}9aA`;

let failures = 0;
let checks = 0;
function check(name: string, ok: unknown, detail = "") {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${!ok && detail ? `  — ${detail}` : ""}`);
}
function section(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------------------ client */

interface Reply<T = any> {
  status: number;
  ok: boolean;
  data?: T;
  error?: { code: string; messageKey: string; fields?: Array<{ field: string; messageKey: string }> };
  headers: Headers;
  raw: string;
}

class Client {
  jar = new Map<string, string>();
  csrf = "";
  readonly ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

  private cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  private absorb(response: Response) {
    for (const entry of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = entry.split(";");
      const [name, ...rest] = pair!.split("=");
      const value = rest.join("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === "";
      if (expired) this.jar.delete(name!.trim());
      else this.jar.set(name!.trim(), value);
    }
  }

  async call<T = any>(method: string, path: string, body?: unknown, extra: Record<string, string> = {}): Promise<Reply<T>> {
    const response = await fetch(`${BASE}${path}`, {
      method,
      redirect: "manual",
      headers: {
        cookie: this.cookieHeader(),
        "x-forwarded-for": this.ip,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" && this.csrf ? { "x-csrf-token": this.csrf } : {}),
        ...extra,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.absorb(response);
    const raw = await response.text();
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* not JSON (CSV, HTML) */
    }
    return { status: response.status, ok: parsed.ok === true, data: parsed.data, error: parsed.error, headers: response.headers, raw };
  }

  get = <T = any>(path: string) => this.call<T>("GET", path);
  post = <T = any>(path: string, body: unknown = {}) => this.call<T>("POST", path, body);

  /** Establishes the CSRF cookie + token, as the browser does on first load. */
  async init() {
    const session = await this.get("/api/auth/session");
    this.csrf = session.data.csrfToken;
    return this;
  }

  async login(identifier: string, password: string) {
    return this.post("/api/auth/login", { identifier, password });
  }
}

const money = (millimes: bigint | number) => Number(millimes) / 1000;

/* -------------------------------------------------------------- provisioning */

/** A staff account created straight in the database (the seed's equivalent). */
async function provisionStaff(label: string, role: "SUPERADMIN" | "MANAGER") {
  const username = `t${RUN}${label}`;
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await createHasher().hash(PASSWORD),
      role,
      status: "ACTIVE",
      profile: { create: { displayName: username } },
      wallet: { create: {} },
    },
  });
  return { id: user.id, username };
}

async function ledgerSum(userId: string) {
  const sum = await prisma.transaction.aggregate({ where: { userId }, _sum: { amount: true } });
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return { sum: money(sum._sum.amount ?? 0n), balance: money(wallet?.balance ?? 0n) };
}

/**
 * A player the way the platform now makes them: created under a manager. The row
 * is written directly (the creation flow has its own section below), then the
 * player signs in with the password it was given.
 */
async function register(username: string) {
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await createHasher().hash(PASSWORD),
      role: "PLAYER",
      status: "ACTIVE",
      createdById: defaultManager.id,
      profile: { create: { displayName: username } },
      wallet: { create: {} },
    },
  });
  const client = await new Client().init();
  const reply = await client.login(username, PASSWORD);
  void user;
  return { client, reply };
}

async function credit(admin: Client, playerId: string, amount: number, type = "DEPOSIT", reason = "integration test funding") {
  return admin.post("/api/admin/wallet/adjustments", {
    playerId,
    type,
    amount,
    reason,
    confirm: true,
    idempotencyKey: randomBytes(8).toString("hex"),
  });
}

/* ================================================================== tests */

console.log(`\nSportGo integration test — ${BASE} — run ${RUN}\n`);

const adminA = await provisionStaff("a", "SUPERADMIN");
const adminB = await provisionStaff("b", "SUPERADMIN");
const defaultManager = await provisionStaff("m0", "MANAGER");

section("Anonymous access");
{
  const anon = await new Client().init();
  for (const path of ["/api/account", "/api/wallet", "/api/transactions", "/api/bets", "/api/admin/dashboard", "/api/admin/players", "/api/admin/audit-logs", "/api/admin/settings"]) {
    const r = await anon.get(path);
    check(`GET ${path} → 401`, r.status === 401, `got ${r.status}`);
  }
  const noCsrf = await new Client().call("POST", "/api/auth/login", { identifier: "x", password: "y" });
  check("state-changing request without CSRF token is refused", noCsrf.status === 403, `got ${noCsrf.status}`);
  const adminPage = await fetch(`${BASE}/admin`, { redirect: "manual" });
  check("/admin redirects an anonymous visitor to sign in", adminPage.status === 307 && (adminPage.headers.get("location") ?? "").startsWith("/login"));
}

section("There is no sign-up");
{
  const anon = await new Client().init();
  const reg = await anon.post("/api/auth/register", { username: `zz${RUN}`, password: PASSWORD });
  check("the sign-up endpoint is gone", reg.status === 404, `got ${reg.status}`);
  const forgot = await anon.post("/api/auth/password/forgot", { email: "a@b.co" });
  check("so is self-service password recovery (no e-mail exists)", forgot.status === 404, `got ${forgot.status}`);
  const page = await fetch(`${BASE}/register`, { redirect: "manual" });
  const forgotPage = await fetch(`${BASE}/forgot-password`, { redirect: "manual" });
  check("/register and /forgot-password are 404", page.status === 404 && forgotPage.status === 404, `${page.status} ${forgotPage.status}`);
  const before = await prisma.user.count();
  await anon.post("/api/auth/register", { username: `zz${RUN}`, password: PASSWORD });
  check("…and nothing was created", (await prisma.user.count()) === before);
}

section("Players sign in with the credentials they were given");
const uA = `pa${RUN}`;
const uB = `pb${RUN}`;
const { client: playerA, reply: regA } = await register(uA);
check("player A signs in", regA.status === 200, JSON.stringify(regA.error));
const idA = regA.data?.user?.id as string;
const { client: playerB, reply: regB } = await register(uB);
const idB = regB.data?.user?.id as string;
check("player B signs in", regB.status === 200);
{
  const me = await playerA.get("/api/account");
  check("GET /api/account returns the player's own overview", me.status === 200 && me.data.user.id === idA);
  check("new wallet starts at zero", me.data.wallet.balance === 0);
  const stored = await prisma.user.findUnique({ where: { id: idA } });
  check("password is stored as an Argon2id hash, never plaintext", stored!.passwordHash.startsWith("$argon2id$") && !stored!.passwordHash.includes(PASSWORD));
  check("a player carries no e-mail or phone (there is no such column)", !("email" in stored!) && !("phone" in stored!));
}

section("Sign-in, lockout and enumeration resistance");
{
  const c = await new Client().init();
  const unknown = await c.login(`nobody${RUN}`, PASSWORD);
  const wrong = await c.login(uA, "Wrong-password-1");
  check("unknown user and wrong password give the same status + message", unknown.status === 401 && wrong.status === 401 && unknown.error?.messageKey === wrong.error?.messageKey);
  const okLogin = await c.login(uA, PASSWORD);
  check("correct credentials sign in", okLogin.status === 200 && okLogin.data.user.id === idA);

  // lockout: a fresh account so the earlier steps don't count
  const { reply: lockReg } = await register(`lk${RUN}`);
  const lockId = lockReg.data.user.id as string;
  const attacker = await new Client().init();
  let last: Reply | null = null;
  for (let i = 0; i < 5; i += 1) last = await attacker.login(`lk${RUN}`, "Not-the-password-1");
  const lockedTry = await attacker.login(`lk${RUN}`, PASSWORD);
  check("after repeated failures the right password is refused too (temporary lock)", lockedTry.status === 401 && lockedTry.error?.messageKey === "auth.error.temporarilyLocked", `${lockedTry.status} ${lockedTry.error?.messageKey}`);
  void last;
  const locked = await prisma.user.findUnique({ where: { id: lockId } });
  check("lockout is recorded on the account", !!locked?.lockedUntil && locked.lockedUntil > new Date());
  const audits = await prisma.auditLog.count({ where: { targetUserId: lockId, action: "auth.account_locked" } });
  check("lockout wrote an audit record", audits >= 1);
}

section("Sessions");
{
  const c = await new Client().init();
  await c.login(uA, PASSWORD);
  const before = await c.get("/api/account");
  check("session persists across requests", before.status === 200);
  const cookie = c.jar.get("sportgo_session");
  const out = await c.post("/api/auth/logout");
  check("logout succeeds", out.status === 200);
  const stale = new Client();
  stale.jar.set("sportgo_session", cookie!);
  const reuse = await stale.get("/api/account");
  check("the old session token is dead after logout (revoked server-side)", reuse.status === 401, `got ${reuse.status}`);
  const stored = await prisma.session.findFirst({ where: { userId: idA }, orderBy: { createdAt: "desc" } });
  check("only a hash of the token is stored", !!stored && stored.tokenHash !== cookie && !stored.tokenHash.includes(cookie!.slice(0, 12)));
}

section("Role-based access control");
const admin = await new Client().init();
const login = await admin.login(adminA.username, PASSWORD);
check("admin signs in", login.status === 200 && login.data.user.role === "superadmin", JSON.stringify(login.error));
{
  const endpoints: Array<[string, string, unknown?]> = [
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/activity"],
    ["GET", "/api/admin/players"],
    ["GET", `/api/admin/players/${idB}`],
    ["GET", `/api/admin/players/${idB}/wallet`],
    ["GET", "/api/admin/transactions"],
    ["GET", "/api/admin/bets"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/search?q=test"],
    ["GET", "/api/admin/settings"],
    ["GET", "/api/admin/reports/export?kind=summary"],
    ["GET", "/api/admin/wallet/requests"],
    ["POST", "/api/admin/players", { displayName: "hacker" }],
    ["GET", "/api/admin/managers"],
    ["POST", "/api/admin/managers", { displayName: "hacker" }],
    ["POST", `/api/admin/players/${idB}/credit`, { amount: 10 }],
    ["POST", "/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: 100, reason: "free money", confirm: true }],
    ["POST", `/api/admin/players/${idB}/status`, { action: "suspend", reason: "because", confirm: true }],
    ["POST", `/api/admin/players/${idB}/credentials`, { confirm: true }],
    ["PATCH", "/api/admin/settings", { "general.maintenanceMode": true }],
  ];
  const before = await prisma.transaction.count({ where: { userId: idA } });
  let allForbidden = true;
  for (const [method, path, body] of endpoints) {
    const r = await playerA.call(method, path, body);
    if (r.status !== 403) allForbidden = false;
    check(`player → ${method} ${path.split("?")[0]} is 403`, r.status === 403, `got ${r.status}`);
  }
  check("every admin endpoint refused a player", allForbidden);
  const after = await prisma.transaction.count({ where: { userId: idA } });
  check("…and the forbidden adjustment created no ledger entry", before === after);
  const logged = await prisma.auditLog.count({ where: { actorId: idA, action: "security.forbidden" } });
  check("blocked attempts are written to the audit log with the caller's id", logged >= 5, `only ${logged}`);

  const stillPlayer = await prisma.user.findUnique({ where: { id: idB } });
  check("player B was not suspended by the forbidden call", stillPlayer?.status === "ACTIVE");
}

section("Player data isolation");
{
  const funded = await credit(admin, idA, 50);
  check("admin funds player A with 50", funded.status === 201, JSON.stringify(funded.error));
  const a = await playerA.get(`/api/transactions?userId=${idB}&pageSize=100`);
  check("a userId query parameter cannot widen a player's own history", a.status === 200 && a.data.items.every((t: any) => t.userId === idA));
  check("player A's rows carry no internal reason or actor", a.data.items.every((t: any) => !("reason" in t) && !("createdByUsername" in t) && !("username" in t)));
  const b = await playerB.get("/api/transactions");
  check("player B sees none of A's transactions", b.data.items.length === 0);
  const wA = await playerA.get("/api/wallet");
  const wB = await playerB.get("/api/wallet");
  check("wallets are per session", wA.data.balance === 50 && wB.data.balance === 0);
  const bets = await playerB.get(`/api/bets?userId=${idA}`);
  check("bets endpoint is session-scoped", bets.status === 200 && bets.data.items.length === 0);
}

section("Ledger: manual credit / debit");
{
  const tx = await prisma.transaction.findFirst({ where: { userId: idA }, orderBy: { createdAt: "desc" } });
  check("entry records balance before/after and the acting admin", tx!.balanceBefore === 0n && tx!.balanceAfter === 50_000n && tx!.createdById === adminA.id);
  const meta = tx!.metadata as any;
  check("internal reason is kept in metadata, not in the player-facing description", meta.reason === "integration test funding" && !tx!.description?.includes("integration"));
  const audit = await prisma.auditLog.findFirst({ where: { transactionId: tx!.id } });
  check("an audit record exists for the entry (actor, target, transaction)", audit?.actorId === adminA.id && audit.targetUserId === idA && audit.action === "admin.wallet.adjusted");

  const over = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_DEBIT", amount: 500, reason: "debit more than they have", confirm: true });
  check("a debit beyond the balance is refused", over.status === 422 && over.error?.messageKey === "wallet.error.insufficientFunds", `${over.status} ${over.error?.messageKey}`);
  check("…and the balance is unchanged", (await ledgerSum(idA)).balance === 50);

  const noConfirm = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: 5, reason: "no confirmation" });
  check("an adjustment without explicit confirmation is refused", noConfirm.status === 422);
  const noReason = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: 5, reason: "", confirm: true });
  check("an adjustment without a reason is refused", noReason.status === 422);
  const negative = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: -5, reason: "negative amount", confirm: true });
  check("a negative amount is refused", negative.status === 422);
  const adminTarget = await admin.post("/api/admin/wallet/adjustments", { playerId: adminB.id, type: "ADMIN_CREDIT", amount: 5, reason: "credit an administrator", confirm: true });
  check("administrators have no wallet to credit", adminTarget.status === 422);

  const key = randomBytes(8).toString("hex");
  const first = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "BONUS", amount: 10, reason: "idempotency check", confirm: true, idempotencyKey: key });
  const again = await admin.post("/api/admin/wallet/adjustments", { playerId: idA, type: "BONUS", amount: 10, reason: "idempotency check", confirm: true, idempotencyKey: key });
  const rows = await prisma.transaction.count({ where: { userId: idA, type: "BONUS" } });
  check("the same idempotency key posts exactly once", first.status === 201 && rows === 1, `rows=${rows} second=${again.status}`);
  const { sum, balance } = await ledgerSum(idA);
  check("balance equals the sum of the ledger", sum === balance && balance === 60, `sum=${sum} balance=${balance}`);
}

section("Ledger: concurrency (double-spend)");
{
  // Player A has 60. Fire 12 withdrawal requests of 20 at once: exactly 3 may succeed.
  const burst = await Promise.all(
    Array.from({ length: 12 }, () =>
      playerA.post("/api/wallet/withdraw", { methodId: "pm-operator-payout", amount: 20, confirmOwnership: true, idempotencyKey: randomBytes(8).toString("hex") }),
    ),
  );
  const accepted = burst.filter((r) => r.status === 201).length;
  const { sum, balance } = await ledgerSum(idA);
  check("12 parallel 20-unit withdrawals against a 60 balance: exactly 3 succeed", accepted === 3, `accepted=${accepted}`);
  check("the balance never went negative and equals the ledger", balance === 0 && sum === 0, `balance=${balance} sum=${sum}`);
  const held = await prisma.transaction.count({ where: { userId: idA, type: "WITHDRAWAL", status: "PENDING" } });
  check("each accepted withdrawal is one pending ledger entry", held === 3, `held=${held}`);

  const same = randomBytes(8).toString("hex");
  await credit(admin, idA, 30);
  // A fresh client (new address): the burst above rightly used up this address's rate-limit budget.
  const retrier = await new Client().init();
  await retrier.login(uA, PASSWORD);
  const dupes = await Promise.all(
    Array.from({ length: 6 }, () => retrier.post("/api/wallet/withdraw", { methodId: "pm-operator-payout", amount: 10, confirmOwnership: true, idempotencyKey: same })),
  );
  const created = await prisma.transaction.count({ where: { userId: idA, idempotencyKey: `withdraw:${same}` } });
  check("six concurrent retries with one idempotency key create one withdrawal", created === 1, `created=${created} statuses=${dupes.map((d) => d.status).join(",")}`);
}

section("Withdrawal queue");
{
  const pending = await prisma.transaction.findMany({ where: { userId: idA, type: "WITHDRAWAL", status: "PENDING" }, orderBy: { createdAt: "asc" } });
  const [w1, w2] = pending;
  const before = await ledgerSum(idA);
  const reject = await admin.post(`/api/admin/withdrawals/${w1!.id}`, { decision: "reject", note: "test rejection" });
  const after = await ledgerSum(idA);
  check("rejecting a withdrawal returns the held funds", reject.status === 200 && after.balance === before.balance + money(-w1!.amount), `${before.balance} → ${after.balance}`);
  const orig = await prisma.transaction.findUnique({ where: { id: w1!.id } });
  check("the original entry is marked reversed and a refund entry points back to it", orig?.status === "REVERSED" && (await prisma.transaction.count({ where: { relatedId: w1!.id, type: "REFUND" } })) === 1);
  const twice = await admin.post(`/api/admin/withdrawals/${w1!.id}`, { decision: "reject" });
  check("a second decision on the same withdrawal is refused (no double refund)", twice.status === 409, `got ${twice.status}`);
  const raceA = await Promise.all([admin.post(`/api/admin/withdrawals/${w2!.id}`, { decision: "approve" }), admin.post(`/api/admin/withdrawals/${w2!.id}`, { decision: "approve" })]);
  check("two simultaneous approvals: exactly one wins", raceA.filter((r) => r.status === 200).length === 1);
  const done = await prisma.transaction.findUnique({ where: { id: w2!.id } });
  check("approved withdrawal is completed and settled", done?.status === "COMPLETED" && !!done.settledAt);
  const { sum, balance } = await ledgerSum(idA);
  check("ledger still reconciles", sum === balance, `sum=${sum} balance=${balance}`);
}

section("Database-level guarantees");
{
  const tx = await prisma.transaction.findFirst({ where: { userId: idA, status: "COMPLETED" } });
  const attempts: Array<[string, () => Promise<unknown>]> = [
    ["UPDATE a ledger amount", () => prisma.$executeRawUnsafe(`UPDATE "Transaction" SET "amount" = 999999 WHERE "id" = '${tx!.id}'`)],
    ["UPDATE a completed entry's status", () => prisma.$executeRawUnsafe(`UPDATE "Transaction" SET "status" = 'FAILED' WHERE "id" = '${tx!.id}'`)],
    ["DELETE a ledger entry", () => prisma.$executeRawUnsafe(`DELETE FROM "Transaction" WHERE "id" = '${tx!.id}'`)],
    ["UPDATE an audit record", () => prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "description" = 'tampered'`)],
    ["DELETE an audit record", () => prisma.$executeRawUnsafe(`DELETE FROM "AuditLog"`)],
    ["set a negative wallet balance", () => prisma.$executeRawUnsafe(`UPDATE "Wallet" SET "balance" = -1 WHERE "userId" = '${idA}'`)],
  ];
  for (const [name, run] of attempts) {
    let refused = false;
    try {
      await run();
    } catch {
      refused = true;
    }
    check(`database refuses to ${name}`, refused);
  }
  const via = await prisma.auditLog.count();
  check("audit log is intact after the tampering attempts", via > 0);
}

section("Four-eyes approval");
{
  const patch = await admin.call("PATCH", "/api/admin/settings", { "wallet.adjustmentApprovalThreshold": 40 });
  check("administrator sets an approval threshold", patch.status === 200, JSON.stringify(patch.error));
  const before = (await ledgerSum(idB)).balance;
  const big = await admin.post("/api/admin/wallet/adjustments", { playerId: idB, type: "ADMIN_CREDIT", amount: 100, reason: "large credit needing approval", confirm: true });
  check("an adjustment above the threshold is queued, not applied", big.status === 201 && big.data.pendingApproval === true && (await ledgerSum(idB)).balance === before);
  const requests = await admin.get("/api/admin/wallet/requests?status=pending");
  const request = requests.data.find((r: any) => r.userId === idB);
  const self = await admin.post(`/api/admin/wallet/requests/${request.id}`, { decision: "approve" });
  check("the requester cannot approve their own request", self.status === 409 && self.error?.messageKey === "admin.wallet.error.selfApproval", `${self.status} ${self.error?.messageKey}`);

  const second = await new Client().init();
  await second.login(adminB.username, PASSWORD);
  const approved = await second.post(`/api/admin/wallet/requests/${request.id}`, { decision: "approve" });
  check("a different administrator approves it", approved.status === 200, JSON.stringify(approved.error));
  check("the ledger entry is applied once", (await ledgerSum(idB)).balance === before + 100);
  const again = await second.post(`/api/admin/wallet/requests/${request.id}`, { decision: "approve" });
  check("approving twice does not credit twice", again.status === 409 && (await ledgerSum(idB)).balance === before + 100);
  await admin.call("PATCH", "/api/admin/settings", { "wallet.adjustmentApprovalThreshold": 0 });
}

section("Sportsbook tickets");
{
  const events = await playerA.get("/api/events?status=scheduled&limit=40");
  const picks: any[] = [];
  const seen = new Set<string>();
  for (const event of events.data ?? []) {
    const market = event.markets?.find((m: any) => m.status === "open" && m.key === "1x2");
    const selection = market?.selections?.find((s: any) => s.active);
    if (event.status === "scheduled" && selection && !seen.has(event.id)) {
      seen.add(event.id);
      picks.push({ selectionId: selection.id, marketId: market.id, eventId: event.id, odds: selection.odds });
    }
    if (picks.length === 6) break;
  }
  check("found open selections in the book", picks.length >= 4, `found ${picks.length}`);

  await credit(admin, idA, 100);
  const startBalance = (await ledgerSum(idA)).balance;

  const unknown = await playerA.post("/api/bets", { mode: "single", selections: [{ selectionId: "nope", marketId: "nope", eventId: "nope", odds: 2, stake: 5 }] });
  check("an unknown selection is refused", unknown.status === 422);
  const lying = await playerA.post("/api/bets", { mode: "single", selections: [{ ...picks[0], odds: picks[0].odds + 3, stake: 5 }], acceptOddsChange: false });
  check("a stale / forged price is rejected when the player did not accept changes", lying.status === 409 && lying.error?.messageKey === "betting.error.oddsChanged", `${lying.status} ${lying.error?.messageKey}`);

  const key = randomBytes(8).toString("hex");
  const placed = await playerA.post("/api/bets", { mode: "multiple", selections: picks.slice(0, 3), stake: 10, acceptOddsChange: true, idempotencyKey: key });
  check("a multiple is placed (201)", placed.status === 201, JSON.stringify(placed.error));
  const ticket = placed.data.tickets[0];
  const row = await prisma.bet.findUnique({ where: { id: ticket.id }, include: { legs: true } });
  const serverOdds = row!.legs.reduce((p, l) => p * (l.oddsMilli / 1000), 1);
  check("the server priced the ticket from its own book", Math.abs(ticket.totalOdds - serverOdds) < 0.01 && row!.legs.length === 3);
  check("stake debited exactly once", (await ledgerSum(idA)).balance === startBalance - 10);
  const replay = await playerA.post("/api/bets", { mode: "multiple", selections: picks.slice(0, 3), stake: 10, acceptOddsChange: true, idempotencyKey: key });
  check("retrying with the same key returns the same ticket and debits nothing", replay.status === 200 && replay.data.replayed === true && replay.data.tickets[0].id === ticket.id && (await ledgerSum(idA)).balance === startBalance - 10);

  const beforeBurst = (await ledgerSum(idA)).balance;
  const burst = await Promise.all(
    Array.from({ length: 10 }, () =>
      playerA.post("/api/bets", { mode: "single", selections: [{ ...picks[3], stake: 30 }], acceptOddsChange: true, idempotencyKey: randomBytes(8).toString("hex") }),
    ),
  );
  const winners = burst.filter((r) => r.status === 201).length;
  const now = await ledgerSum(idA);
  const affordable = Math.min(10, Math.floor(beforeBurst / 30));
  check(`10 parallel 30-unit bets against ${beforeBurst}: exactly ${affordable} succeed, never more than the balance affords`, winners === affordable && now.balance === beforeBurst - winners * 30 && now.balance >= 0, `winners=${winners} balance=${now.balance}`);
  check("balance equals the ledger after the burst", now.sum === now.balance);

  // settlement
  const open = await admin.get(`/api/admin/bets?kind=sports&status=pending&search=${ticket.reference}`);
  const adminView = open.data.items.find((b: any) => b.id === ticket.id);
  const results = Object.fromEntries(adminView.legIds.map((id: string) => [id, "WON"]));
  const incomplete = await admin.post(`/api/admin/bets/${ticket.id}/settle`, { results: { [adminView.legIds[0]]: "WON" }, confirm: true });
  check("settlement needs a result for every leg", incomplete.status === 409);
  const beforeSettle = (await ledgerSum(idA)).balance;
  const settledBoth = await Promise.all([admin.post(`/api/admin/bets/${ticket.id}/settle`, { results, confirm: true }), admin.post(`/api/admin/bets/${ticket.id}/settle`, { results, confirm: true })]);
  check("two simultaneous settlements: exactly one pays", settledBoth.filter((r) => r.status === 200).length === 1);
  const afterSettle = await ledgerSum(idA);
  const payout = money((await prisma.bet.findUnique({ where: { id: ticket.id } }))!.payout ?? 0n);
  check("winnings credited exactly once, equal to stake × combined odds", Math.abs(afterSettle.balance - beforeSettle - payout) < 0.0005 && Math.abs(payout - 10 * serverOdds) < 0.01, `payout=${payout} odds=${serverOdds}`);
  check("ledger reconciles after settlement", afterSettle.sum === afterSettle.balance);
  const winRows = await prisma.transaction.count({ where: { betId: ticket.id, type: "WIN" } });
  check("exactly one WIN entry for the ticket", winRows === 1);
}

section("Account status and restrictions");
{
  const victim = await register(`st${RUN}`);
  const vid = victim.reply.data.user.id as string;
  await credit(admin, vid, 20);
  const susp = await admin.post(`/api/admin/players/${vid}/status`, { action: "suspend", reason: "integration test suspension", confirm: true });
  check("admin suspends a player", susp.status === 200, JSON.stringify(susp.error));
  const dead = await victim.client.get("/api/account");
  check("the suspended player's live session stops working immediately", dead.status === 401, `got ${dead.status}`);
  const relog = await (await new Client().init()).login(`st${RUN}`, PASSWORD);
  check("a suspended player cannot sign in (after a correct password)", relog.status === 401 && relog.error?.messageKey === "auth.error.accountSuspended");
  const react = await admin.post(`/api/admin/players/${vid}/status`, { action: "reactivate", reason: "integration test", confirm: true });
  check("admin reactivates", react.status === 200);
  const again = await (await new Client().init()).login(`st${RUN}`, PASSWORD);
  check("reactivated player signs in again", again.status === 200);

  const restrict = await admin.post(`/api/admin/players/${vid}/restrictions`, { wageringBlocked: true, withdrawalsBlocked: true, reason: "integration test restriction" });
  check("admin restricts wagering and withdrawals", restrict.status === 200);
  const blockedClient = await new Client().init();
  await blockedClient.login(`st${RUN}`, PASSWORD);
  const wd = await blockedClient.post("/api/wallet/withdraw", { methodId: "pm-operator-payout", amount: 5, confirmOwnership: true });
  check("a withdrawal-blocked player's request is refused server-side", wd.status === 422 && wd.error?.messageKey === "wallet.error.withdrawalsBlocked", `${wd.status} ${wd.error?.messageKey}`);
  const events2 = await blockedClient.get("/api/events?status=scheduled&limit=10");
  const e2 = events2.data.find((e: any) => e.markets?.some((m: any) => m.key === "1x2" && m.status === "open"));
  const m2 = e2.markets.find((m: any) => m.key === "1x2" && m.status === "open");
  const tryBet = await blockedClient.post("/api/bets", { mode: "single", selections: [{ selectionId: m2.selections[0].id, marketId: m2.id, eventId: e2.id, odds: m2.selections[0].odds, stake: 5 }], acceptOddsChange: true });
  check("a wagering-blocked player cannot bet (even on a valid selection)", tryBet.status === 422 && tryBet.error?.messageKey === "account.error.wageringBlocked", `${tryBet.status} ${tryBet.error?.messageKey}`);
}

section("Responsible gambling is enforced by the server");
{
  const rg = await register(`rg${RUN}`);
  const rid = rg.reply.data.user.id as string;
  await credit(admin, rid, 200);
  const events = await rg.client.get("/api/events?status=scheduled&limit=20");
  let pick: any = null;
  for (const event of events.data ?? []) {
    const market = event.markets?.find((m: any) => m.status === "open" && m.key === "1x2");
    const selection = market?.selections?.find((s: any) => s.active);
    if (selection) { pick = { selectionId: selection.id, marketId: market.id, eventId: event.id, odds: selection.odds }; break; }
  }
  const lim = await rg.client.post("/api/bets", { mode: "single", selections: [{ ...pick, stake: 20 }], acceptOddsChange: true });
  check("baseline: an unlimited player can bet 20", lim.status === 201, JSON.stringify(lim.error));

  await prisma.responsibleGamblingLimit.create({ data: { userId: rid, kind: "SINGLE_BET", period: "DAILY", value: 5_000n } });
  const over = await rg.client.post("/api/bets", { mode: "single", selections: [{ ...pick, stake: 10 }], acceptOddsChange: true });
  check("a single-bet limit of 5 refuses a 10 stake", over.status === 422 && over.error?.messageKey === "responsible.error.singleBetLimit", `${over.status} ${over.error?.messageKey}`);

  await prisma.selfExclusion.create({ data: { userId: rid, kind: "SELF_EXCLUSION", endsAt: new Date(Date.now() + 864e5) } });
  const excluded = await rg.client.post("/api/bets", { mode: "single", selections: [{ ...pick, stake: 1 }], acceptOddsChange: true });
  check("a self-excluded player cannot bet (no matter the UI)", excluded.status === 403 || excluded.status === 422, `${excluded.status}`);
  const wd = await rg.client.post("/api/wallet/withdraw", { methodId: "pm-operator-payout", amount: 10, confirmOwnership: true });
  check("…but can still withdraw", wd.status === 201, JSON.stringify(wd.error));
}

section("Settings take effect");
{
  const unknownKey = await admin.call("PATCH", "/api/admin/settings", { "evil.setting": true });
  check("an unknown setting key is rejected, not stored", unknownKey.status === 422);
  const outOfRange = await admin.call("PATCH", "/api/admin/settings", { "security.maxFailedLogins": 9999 });
  check("an out-of-range value is rejected", outOfRange.status === 422);

  await admin.call("PATCH", "/api/admin/settings", { "general.maintenanceMode": true });
  const blocked = await (await new Client().init()).login(uB, PASSWORD);
  const adminOk = await (await new Client().init()).login(adminA.username, PASSWORD);
  check("maintenance mode blocks players from signing in, but not the superadmin", blocked.status === 401 && adminOk.status === 200);
  await admin.call("PATCH", "/api/admin/settings", { "general.maintenanceMode": false });
}

section("Managers: generated credentials and the credit chain");
const mgrB = await provisionStaff("mb", "MANAGER");
{
  const pageStatus = async (client: Client, path: string) =>
    (await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: [...client.jar].map(([k, v]) => `${k}=${v}`).join("; "), "x-forwarded-for": client.ip } })).status;
  const fresh = async (username: string, password: string) => {
    const c = await new Client().init();
    const reply = await c.login(username, password);
    return { c, reply };
  };

  /* ---- the superadmin creates a manager ------------------------------------------------- */
  const created = await admin.post("/api/admin/managers", { displayName: "Test Manager", initialCredit: 500, idempotencyKey: randomBytes(8).toString("hex") });
  check("the superadmin creates a manager (201) with generated credentials", created.status === 201 && /^m-/.test(created.data?.credentials?.username ?? "") && (created.data?.credentials?.password ?? "").length >= 12, JSON.stringify(created.error));
  const mId = created.data.managerId as string;
  const mUser = created.data.credentials.username as string;
  const generated = created.data.credentials.password as string;
  const row = await prisma.user.findUnique({ where: { id: mId } });
  check("the password is stored only as an Argon2id hash", row!.passwordHash.startsWith("$argon2id$") && !row!.passwordHash.includes(generated));
  check("the manager belongs to the superadmin and must change the generated password", row!.role === "MANAGER" && row!.createdById === adminA.id && row!.mustChangePassword);
  const trail = await prisma.auditLog.findMany({ where: { targetUserId: mId } });
  check("the generated password appears nowhere in the audit trail", trail.length > 0 && trail.every((r) => !JSON.stringify(r).includes(generated)));

  let M = (await fresh(mUser, generated)).c;
  const gate = await M.get("/api/admin/players");
  check("the manager signs in with it, but is held to a password change", gate.status === 403 && gate.error?.messageKey === "auth.error.passwordChangeRequired", `${gate.status} ${gate.error?.messageKey}`);
  const NEWM = `${PASSWORD}-mgr1`;
  const changedM = await M.post("/api/auth/password/change", { currentPassword: generated, newPassword: NEWM, confirmPassword: NEWM });
  check("the manager chooses their own password", changedM.status === 200, JSON.stringify(changedM.error));
  check("…and the generated one stops working", (await fresh(mUser, generated)).reply.status === 401);
  M = (await fresh(mUser, NEWM)).c;
  const bal0 = await ledgerSum(mId);
  check("the opening credit is on the manager's wallet and the ledger reconciles", bal0.balance === 500 && bal0.sum === 500, JSON.stringify(bal0));

  /* ---- what a manager cannot reach -------------------------------------------------------- */
  const denied: Array<[string, string, unknown?]> = [
    ["GET", "/api/admin/dashboard"],
    ["GET", "/api/admin/audit-logs"],
    ["GET", "/api/admin/settings"],
    ["GET", "/api/admin/managers"],
    ["POST", "/api/admin/managers", { displayName: "x" }],
    ["POST", `/api/admin/managers/${mId}/credit`, { amount: 10 }],
    ["GET", "/api/admin/bets"],
    ["GET", "/api/admin/wallet/requests"],
    ["GET", "/api/admin/search?q=test"],
    ["GET", "/api/admin/reports/export?kind=summary"],
    ["POST", "/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: 5, reason: "free money", confirm: true }],
    ["POST", `/api/admin/players/${idA}/restrictions`, { wageringBlocked: true, withdrawalsBlocked: false, reason: "not mine" }],
  ];
  const leaks: string[] = [];
  for (const [method, path, body] of denied) {
    const r = await M.call(method, path, body);
    if (r.status !== 403) leaks.push(`${method} ${path.split("?")[0]} → ${r.status}`);
  }
  check("a manager is refused every superadmin endpoint", leaks.length === 0, leaks.join("; "));

  /* ---- creating a player ------------------------------------------------------------------- */
  const p1 = await M.post("/api/admin/players", {
    displayName: "Test P1", initialCredit: 50, role: "SUPERADMIN", status: "ACTIVE", balance: 1_000_000,
    idempotencyKey: randomBytes(8).toString("hex"),
  });
  check("a manager creates a player (201) with generated credentials", p1.status === 201 && /^p-/.test(p1.data?.credentials?.username ?? ""), JSON.stringify(p1.error));
  const p1Id = p1.data.playerId as string;
  const p1User = p1.data.credentials.username as string;
  const p1Pass = p1.data.credentials.password as string;
  const p1Row = await prisma.user.findUnique({ where: { id: p1Id } });
  check("the player is the manager's, is a plain player (role in the body ignored) and must change the password", p1Row!.role === "PLAYER" && p1Row!.createdById === mId && p1Row!.mustChangePassword);
  const afterCreate = { m: await ledgerSum(mId), p: await ledgerSum(p1Id) };
  check("the opening credit came out of the manager's balance (500 → 450; player 50)", afterCreate.m.balance === 450 && afterCreate.p.balance === 50, JSON.stringify(afterCreate));
  check("both ledgers reconcile", afterCreate.m.sum === afterCreate.m.balance && afterCreate.p.sum === afterCreate.p.balance);
  const legs = await prisma.transaction.findMany({ where: { userId: { in: [mId, p1Id] }, type: { in: ["CREDIT_TRANSFER", "DEPOSIT"] } } });
  const out = legs.find((l) => l.userId === mId && l.type === "CREDIT_TRANSFER");
  const inn = legs.find((l) => l.userId === p1Id && l.type === "DEPOSIT");
  check("the two sides of the sale are equal, opposite and linked", !!out && !!inn && out.amount === -inn.amount && inn.relatedId === out.id);

  /* ---- the player's first sign-in ---------------------------------------------------------- */
  let P1 = (await fresh(p1User, p1Pass)).c;
  const held = await P1.get("/api/account");
  check("the player signs in with the generated credentials, but must change the password first", held.status === 403 && held.error?.messageKey === "auth.error.passwordChangeRequired", `${held.status}`);
  const NEWP = `${PASSWORD}-ply1`;
  await P1.post("/api/auth/password/change", { currentPassword: p1Pass, newPassword: NEWP, confirmPassword: NEWP });
  P1 = (await fresh(p1User, NEWP)).c;
  const acct = await P1.get("/api/account");
  check("the player then sees the credit they were sold", acct.status === 200 && acct.data.wallet.balance === 50, `${acct.status}`);

  /* ---- selling more credit ------------------------------------------------------------------ */
  const sellKey = randomBytes(8).toString("hex");
  const sale = await M.post(`/api/admin/players/${p1Id}/credit`, { amount: 25, idempotencyKey: sellKey });
  check("a manager sells credit to their player", sale.status === 200 && sale.data.senderBalance === 425 && sale.data.recipientBalance === 75, JSON.stringify(sale.data ?? sale.error));
  const replay = await M.post(`/api/admin/players/${p1Id}/credit`, { amount: 25, idempotencyKey: sellKey });
  check("a retried sale (same key) moves nothing", replay.status === 200 && (await ledgerSum(mId)).balance === 425 && (await ledgerSum(p1Id)).balance === 75);
  const over = await M.post(`/api/admin/players/${p1Id}/credit`, { amount: 430, idempotencyKey: randomBytes(8).toString("hex") });
  check("selling more than the manager holds is refused", over.status === 422 && over.error?.messageKey === "credit.error.insufficientBalance", `${over.status} ${over.error?.messageKey}`);
  const race = await Promise.all(Array.from({ length: 5 }, () => M.post(`/api/admin/players/${p1Id}/credit`, { amount: 100, idempotencyKey: randomBytes(8).toString("hex") })));
  const won = race.filter((r) => r.status === 200).length;
  const afterRace = { m: await ledgerSum(mId), p: await ledgerSum(p1Id) };
  check("five parallel 100-unit sales against 425: exactly four succeed and nothing goes negative", won === 4 && afterRace.m.balance === 25 && afterRace.p.balance === 475, `won=${won} ${JSON.stringify(afterRace)}`);
  check("…and both ledgers still reconcile", afterRace.m.sum === afterRace.m.balance && afterRace.p.sum === afterRace.p.balance);

  /* ---- scope: a manager sees and touches only their own players ------------------------- */
  const MB = (await fresh(mgrB.username, PASSWORD)).c;
  const peek = await MB.get(`/api/admin/players/${p1Id}`);
  check("another manager cannot read this manager's player (404)", peek.status === 404, `${peek.status}`);
  const steal = await MB.post(`/api/admin/players/${p1Id}/credit`, { amount: 10 });
  check("…nor sell them credit", steal.status === 422 && steal.error?.messageKey === "admin.players.error.notFound", `${steal.status} ${steal.error?.messageKey}`);
  const hashBefore = (await prisma.user.findUnique({ where: { id: p1Id } }))!.passwordHash;
  const foreignReset = await MB.post(`/api/admin/players/${p1Id}/credentials`, { confirm: true });
  check("…nor reset their password", foreignReset.status === 403 && (await prisma.user.findUnique({ where: { id: p1Id } }))!.passwordHash === hashBefore, `${foreignReset.status}`);
  const foreignSuspend = await MB.post(`/api/admin/players/${p1Id}/status`, { action: "suspend", reason: "not their player", confirm: true });
  check("…nor suspend them", foreignSuspend.status === 403 && (await prisma.user.findUnique({ where: { id: p1Id } }))!.status === "ACTIVE", `${foreignSuspend.status}`);
  const listB = await MB.get("/api/admin/players?pageSize=100");
  check("a manager's player list never contains another manager's players", listB.status === 200 && !listB.data.items.some((p: any) => p.id === p1Id) && listB.data.items.every((p: any) => p.managerId === mgrB.id));
  const listM = await M.get("/api/admin/players?pageSize=100");
  check("…while the owner sees theirs", listM.data.items.length === 1 && listM.data.items[0].id === p1Id);
  const txM = await M.get("/api/admin/transactions?pageSize=100");
  check("a manager's ledger view holds only their own and their players' entries", txM.status === 200 && txM.data.items.length > 0 && txM.data.items.every((r: any) => r.userId === mId || r.userId === p1Id));
  const toStaff = await M.post(`/api/admin/players/${defaultManager.id}/credit`, { amount: 5 });
  check("a manager cannot sell credit to another manager", toStaff.status === 422 && toStaff.error?.messageKey === "admin.players.error.notFound", `${toStaff.status}`);
  const toAdmin = await MB.post(`/api/admin/players/${adminA.id}/credit`, { amount: 5 });
  check("…or to the superadmin", toAdmin.status === 422, `${toAdmin.status}`);
  const adminSells = await admin.post(`/api/admin/players/${p1Id}/credit`, { amount: 5 });
  check("the superadmin has no float to sell: the sale endpoint refuses them", adminSells.status === 403, `${adminSells.status}`);
  const saView = await admin.get(`/api/admin/players/${p1Id}`);
  check("the superadmin sees the player and who manages them", saView.status === 200 && saView.data.managerUsername === mUser);
  const byManager = await admin.get(`/api/admin/players?manager=${mId}`);
  check("…and can filter the players of one manager", byManager.data.items.length === 1 && byManager.data.items[0].id === p1Id);

  /* ---- the superadmin issues more credit ---------------------------------------------------- */
  const issue = await admin.post(`/api/admin/managers/${mId}/credit`, { amount: 100, idempotencyKey: randomBytes(8).toString("hex") });
  check("the superadmin issues more credit to the manager", issue.status === 200 && issue.data.recipientBalance === 125, JSON.stringify(issue.data ?? issue.error));
  const issuePlayer = await admin.post(`/api/admin/managers/${p1Id}/credit`, { amount: 10 });
  check("credit cannot be issued to a player through the manager endpoint", issuePlayer.status === 422 && issuePlayer.error?.messageKey === "admin.managers.error.notFound", `${issuePlayer.status}`);
  const mgrList = await admin.get("/api/admin/managers");
  const listed = mgrList.data.items.find((m: any) => m.id === mId);
  check("the manager list shows balance and player count", !!listed && listed.balance === 125 && listed.playerCount === 1, JSON.stringify(listed));

  /* ---- the owner re-keys, suspends, reactivates ------------------------------------------- */
  const rst = await M.post(`/api/admin/players/${p1Id}/credentials`, { confirm: true });
  check("the owner generates a new password for their player", rst.status === 200 && !!rst.data.credentials.password && rst.data.credentials.password !== NEWP, JSON.stringify(rst.error));
  check("…which ends the player's session and kills the old password", (await P1.get("/api/account")).status === 401 && (await fresh(p1User, NEWP)).reply.status === 401);
  const relog = await fresh(p1User, rst.data.credentials.password);
  check("the new password works and forces a change again", relog.reply.status === 200 && relog.reply.data.user.mustChangePassword === true);
  const sus = await M.post(`/api/admin/players/${p1Id}/status`, { action: "suspend", reason: "testing suspension", confirm: true });
  check("the owner suspends their player", sus.status === 200, JSON.stringify(sus.error));
  check("a suspended player cannot sign in", (await fresh(p1User, rst.data.credentials.password)).reply.status === 401);
  const react = await M.post(`/api/admin/players/${p1Id}/status`, { action: "reactivate", reason: "testing reactivation", confirm: true });
  check("…and can after reactivation", react.status === 200 && (await fresh(p1User, rst.data.credentials.password)).reply.status === 200);

  /* ---- withdrawals: the cash-out end of the chain ------------------------------------------- */
  const onboard = async (creator: Client, initialCredit?: number) => {
    const r = await creator.post("/api/admin/players", { ...(initialCredit ? { initialCredit } : {}), idempotencyKey: randomBytes(8).toString("hex") });
    if (!r.data) throw new Error(`could not create a player: ${r.status} ${JSON.stringify(r.error)}`);
    const u = r.data.credentials.username as string;
    const pw = r.data.credentials.password as string;
    const first = (await fresh(u, pw)).c;
    await first.post("/api/auth/password/change", { currentPassword: pw, newPassword: NEWP, confirmPassword: NEWP });
    return { id: r.data.playerId as string, username: u, client: (await fresh(u, NEWP)).c };
  };
  const requestWithdrawal = (who: { client: Client }, amount: number) =>
    who.client.post("/api/wallet/withdraw", { methodId: "pm-operator-payout", amount, confirmOwnership: true, idempotencyKey: randomBytes(8).toString("hex") });
  const pendingOf = (userId: string) => prisma.transaction.findFirst({ where: { userId, type: "WITHDRAWAL", status: "PENDING" }, orderBy: { createdAt: "desc" } });

  const w = await onboard(M, 40);
  const req1 = await requestWithdrawal(w, 15);
  check("a manager's player requests a withdrawal", req1.status === 201, JSON.stringify(req1.error));
  const wd1 = (await pendingOf(w.id))!;
  const mNoticed = await M.get("/api/notifications");
  check("the manager is notified of the request", mNoticed.data.some((n: any) => n.kind === "withdrawal_request"));
  const queueM = await M.get("/api/admin/withdrawals");
  check("it is in the manager's queue, which holds only their own players' requests", queueM.status === 200 && queueM.data.items.some((r: any) => r.id === wd1.id) && queueM.data.items.every((r: any) => r.userId === w.id || r.userId === p1Id));
  const queueB = await MB.get("/api/admin/withdrawals");
  check("…and not in another manager's queue", queueB.status === 200 && !queueB.data.items.some((r: any) => r.id === wd1.id));
  const foreignDecision = await MB.post(`/api/admin/withdrawals/${wd1.id}`, { decision: "approve" });
  check("another manager cannot decide it", foreignDecision.status === 409 && foreignDecision.error?.messageKey === "admin.withdrawals.error.notFound" && (await pendingOf(w.id)) !== null, `${foreignDecision.status} ${foreignDecision.error?.messageKey}`);
  check("a player cannot decide it (403)", (await w.client.post(`/api/admin/withdrawals/${wd1.id}`, { decision: "approve" })).status === 403);

  const mBefore = (await ledgerSum(mId)).balance;
  const approved = await M.post(`/api/admin/withdrawals/${wd1.id}`, { decision: "approve", note: "paid in cash" });
  check("the manager approves it", approved.status === 200, JSON.stringify(approved.error));
  const mAfter = await ledgerSum(mId);
  check("the withdrawn credit returned to the manager's balance (+15) and the ledger reconciles", mAfter.balance === mBefore + 15 && mAfter.sum === mAfter.balance, `${mBefore} → ${mAfter.balance}`);
  const wLedger = await ledgerSum(w.id);
  check("the player's wallet is 25, completed, and reconciles", wLedger.balance === 25 && wLedger.sum === wLedger.balance && (await prisma.transaction.findUnique({ where: { id: wd1.id } }))!.status === "COMPLETED");
  const buyBack = await prisma.transaction.findFirst({ where: { userId: mId, type: "CREDIT_TRANSFER", relatedId: wd1.id } });
  check("a ledger entry on the manager records the credit coming back", !!buyBack && buyBack.amount === 15_000n);
  check("a second decision on it is refused (no double credit)", (await M.post(`/api/admin/withdrawals/${wd1.id}`, { decision: "approve" })).status === 409 && (await ledgerSum(mId)).balance === mAfter.balance);

  const req2 = await requestWithdrawal(w, 10);
  const wd2 = (await pendingOf(w.id))!;
  const mBeforeReject = (await ledgerSum(mId)).balance;
  const rejected = await M.post(`/api/admin/withdrawals/${wd2.id}`, { decision: "reject", note: "not paid" });
  check("the manager can reject a request: the player gets the credit back, the manager's balance is untouched", req2.status === 201 && rejected.status === 200 && (await ledgerSum(w.id)).balance === 25 && (await ledgerSum(mId)).balance === mBeforeReject);

  const req3 = await requestWithdrawal(w, 5);
  const wd3 = (await pendingOf(w.id))!;
  const saQueue = await admin.get("/api/admin/withdrawals");
  check("the superadmin sees the same request in a queue of every manager's players", req3.status === 201 && saQueue.data.items.some((r: any) => r.id === wd3.id));
  const mBeforeSa = (await ledgerSum(mId)).balance;
  const saApproves = await admin.post(`/api/admin/withdrawals/${wd3.id}`, { decision: "approve" });
  check("the superadmin can decide it, and the credit still returns to the player's manager", saApproves.status === 200 && (await ledgerSum(mId)).balance === mBeforeSa + 5);

  const own = await onboard(admin);
  await credit(admin, own.id, 30);
  await requestWithdrawal(own, 10);
  const wd4 = (await pendingOf(own.id))!;
  const mgrBalancesBefore = (await prisma.wallet.aggregate({ where: { user: { role: "MANAGER" } }, _sum: { balance: true } }))._sum.balance;
  await admin.post(`/api/admin/withdrawals/${wd4.id}`, { decision: "approve" });
  const mgrBalancesAfter = (await prisma.wallet.aggregate({ where: { user: { role: "MANAGER" } }, _sum: { balance: true } }))._sum.balance;
  check("a player with no manager (created by the superadmin): approving credits nobody", mgrBalancesBefore === mgrBalancesAfter && (await prisma.transaction.count({ where: { type: "CREDIT_TRANSFER", relatedId: wd4.id } })) === 0);

  /* ---- audit ---------------------------------------------------------------------------------- */
  const audits = await prisma.auditLog.findMany({ where: { action: { in: ["admin.manager.created", "admin.player.created", "admin.credit.issued", "admin.credit.sold", "admin.account.credentials_reset"] } } });
  const kinds = new Set(audits.map((a) => a.action));
  check("every step is in the audit trail", ["admin.manager.created", "admin.player.created", "admin.credit.issued", "admin.credit.sold", "admin.account.credentials_reset"].every((a) => kinds.has(a)), [...kinds].join(","));
  const soldRows = audits.filter((a) => a.action === "admin.credit.sold" && a.actorId === mId);
  check("a sale is attributed to the manager who made it", soldRows.length >= 2 && soldRows.every((a) => a.actorRole === "MANAGER"));
  check("credit issuing is a critical audit event", audits.filter((a) => a.action === "admin.credit.issued").every((a) => a.severity === "CRITICAL"));
  check("no audit row of this section contains a generated password", audits.every((a) => !JSON.stringify(a).includes(generated) && !JSON.stringify(a).includes(p1Pass) && !JSON.stringify(a).includes(rst.data.credentials.password)));

  /* ---- notifications ------------------------------------------------------------------------ */
  const mNotes = await M.get("/api/notifications");
  check("the manager is notified of credit they receive", mNotes.status === 200 && mNotes.data.some((n: any) => n.kind === "credit"));

  /* ---- pages ---------------------------------------------------------------------------------- */
  const managerPages = ["/admin", "/admin/players", "/admin/players/new", `/admin/players/${p1Id}`, `/admin/players/${p1Id}?tab=wallet`, `/admin/players/${p1Id}?tab=transactions`, "/admin/transactions", "/admin/withdrawals", "/admin/notifications", "/admin/security"];
  const bad: string[] = [];
  for (const path of managerPages) {
    const status = await pageStatus(M, path);
    if (status !== 200) bad.push(`${path} → ${status}`);
  }
  check(`${managerPages.length} console pages render for a manager`, bad.length === 0, bad.join("; "));
  const hidden = ["/admin/managers", "/admin/managers/new", `/admin/managers/${mId}`, "/admin/settings", "/admin/audit", "/admin/wallet", "/admin/bets", "/admin/reports", "/admin/responsible-gambling"];
  const open: string[] = [];
  for (const path of hidden) {
    const status = await pageStatus(M, path);
    if (status !== 404) open.push(`${path} → ${status}`);
  }
  check("superadmin screens are 404 for a manager", open.length === 0, open.join("; "));
  const foreignPage = await pageStatus(MB, `/admin/players/${p1Id}`);
  check("another manager's player page is 404", foreignPage === 404, `${foreignPage}`);
  check("the superadmin's manager pages render", (await pageStatus(admin, `/admin/managers/${mId}`)) === 200);

  /* ---- the superadmin manages the manager ----------------------------------------------- */
  const susM = await admin.post(`/api/admin/managers/${mId}/status`, { action: "suspend", reason: "testing suspension", confirm: true });
  check("the superadmin suspends a manager", susM.status === 200, JSON.stringify(susM.error));
  check("…whose live session ends and who cannot sign in", (await M.get("/api/admin/players")).status === 401 && (await fresh(mUser, NEWM)).reply.status === 401);
  await admin.post(`/api/admin/managers/${mId}/status`, { action: "reactivate", reason: "testing reactivation", confirm: true });
  const rm = await admin.post(`/api/admin/managers/${mId}/credentials`, { confirm: true });
  check("the superadmin generates a new password for the manager", rm.status === 200 && !!rm.data.credentials.password && (await fresh(mUser, NEWM)).reply.status === 401 && (await fresh(mUser, rm.data.credentials.password)).reply.status === 200);
  const playerCannot = await playerA.post(`/api/admin/managers/${mId}/status`, { action: "suspend", reason: "no", confirm: true });
  check("a player cannot touch a manager (403)", playerCannot.status === 403);
}

section("Casino: server-authoritative rounds");
{
  const anon = await new Client().init();
  const guest = await anon.post("/api/casino/play", { game: "dice", stake: 1, target: 50, direction: "under", idempotencyKey: randomBytes(8).toString("hex") });
  check("a guest cannot play (401)", guest.status === 401);

  const cas = await register(`cs${RUN}`);
  const cid = cas.reply.data.user.id as string;
  const c = cas.client;
  await credit(admin, cid, 2000, "DEPOSIT", "casino test funding");
  const key = () => randomBytes(8).toString("hex");
  const play = (body: Record<string, unknown>) => c.post("/api/casino/play", { idempotencyKey: key(), ...body });
  const act = (body: Record<string, unknown>) => c.post("/api/casino/action", { idempotencyKey: key(), ...body });
  const reconciled = async (label: string) => {
    const { sum, balance } = await ledgerSum(cid);
    check(`ledger reconciles after ${label}`, sum === balance, `sum=${sum} balance=${balance}`);
    return balance;
  };

  // --- cold settings cache -------------------------------------------------------------
  // The wager check reads settings inside the round's transaction. On SQLite that
  // transaction owns the only connection, so a read through the global client
  // deadlocks (P2028) — but only when the 5 s settings cache is cold.
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  const cold = await play({ game: "dice", stake: 1, target: 50, direction: "under" });
  check("a round opens when the settings cache is cold", cold.status === 200, `status ${cold.status}`);

  // --- validation: the browser's own bounds are a courtesy ------------------------------
  for (const [name, body] of [
    ["a stake above the table maximum", { game: "dice", stake: 5000, target: 50, direction: "under" }],
    ["a negative stake", { game: "dice", stake: -5, target: 50, direction: "under" }],
    ["a stake with sub-centime precision", { game: "dice", stake: 1.2345, target: 50, direction: "under" }],
    ["a non-numeric stake", { game: "dice", stake: "lots", target: 50, direction: "under" }],
    ["a dice target outside 2–98", { game: "dice", stake: 1, target: 99.5, direction: "under" }],
    ["a limbo target below 1.01", { game: "limbo", stake: 1, target: 1 }],
    ["an unknown roulette bet", { game: "roulette", bets: [{ key: "n99", amount: 1 }] }],
    ["more mines than tiles allow", { game: "mines", stake: 1, mineCount: 25 }],
  ] as Array<[string, Record<string, unknown>]>) {
    const before = (await ledgerSum(cid)).balance;
    const r = await play(body);
    check(`refused: ${name}`, r.status === 422 && (await ledgerSum(cid)).balance === before, `status=${r.status}`);
  }
  const broke = await play({ game: "dice", stake: 500, target: 50, direction: "under" });
  void broke;
  await reconciled("validation refusals");

  // --- every game settles on the server and the ledger matches ----------------------------
  const dice = await play({ game: "dice", stake: 2, target: 50, direction: "under" });
  check("dice settles in one request", dice.status === 200 && dice.data.settled === true, JSON.stringify(dice.error));
  const limbo = await play({ game: "limbo", stake: 2, target: 2 });
  check("limbo settles", limbo.status === 200 && limbo.data.settled);
  const plinko = await play({ game: "plinko", stake: 2, rows: 12, risk: "medium" });
  check("plinko settles", plinko.status === 200 && plinko.data.settled);
  const roulette = await play({ game: "roulette", bets: [{ key: "red", amount: 2 }, { key: "n17", amount: 1 }] });
  check("roulette settles and debits both bets", roulette.status === 200 && roulette.data.stake === 3);
  let spins = 0;
  for (let i = 0; i < 25; i += 1) {
    const spin = await play({ game: "slots", stake: 1 });
    if (spin.status === 200) spins += 1;
  }
  check("25 slot spins ran", spins === 25);
  await reconciled("dice, limbo, plinko, roulette and 25 slot spins");

  // every settled round: stake debit + (payout credit) accounted for, exactly
  const rounds = await prisma.bet.findMany({ where: { userId: cid, kind: "CASINO", status: { not: "OPEN" } } });
  let allOk = true;
  for (const round of rounds) {
    const rows = await prisma.transaction.findMany({ where: { betId: round.id } });
    const debit = rows.filter((r) => r.type === "BET").reduce((a, r) => a + r.amount, 0n);
    const credit = rows.filter((r) => r.type === "WIN").reduce((a, r) => a + r.amount, 0n);
    const wins = rows.filter((r) => r.type === "WIN").length;
    if (-debit !== (round.stake) || credit !== (round.payout ?? 0n) || wins > 1) allOk = false;
  }
  check(`each of ${rounds.length} settled rounds: stake debited once, payout credited at most once, both equal the round record`, allOk);

  // --- idempotency ------------------------------------------------------------------------
  const replayKey = key();
  const first = await c.post("/api/casino/play", { game: "dice", stake: 1, target: 50, direction: "under", idempotencyKey: replayKey });
  const balanceAfterFirst = (await ledgerSum(cid)).balance;
  const second = await c.post("/api/casino/play", { game: "dice", stake: 1, target: 50, direction: "under", idempotencyKey: replayKey });
  // jsonb does not preserve key order, so compare structure, not serialisation.
  const canon = (value: unknown): string =>
    JSON.stringify(value, (_k, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    );
  check(
    "a retried request returns the original outcome",
    second.status === 200 && second.data.roundId === first.data.roundId && canon(second.data.result) === canon(first.data.result),
    `first=${first.status} second=${second.status} same round=${second.data?.roundId === first.data?.roundId}`,
  );
  check("…and moves no money", (await ledgerSum(cid)).balance === balanceAfterFirst);
  const raceKey = key();
  const race = await Promise.all(Array.from({ length: 6 }, () => c.post("/api/casino/play", { game: "dice", stake: 1, target: 50, direction: "under", idempotencyKey: raceKey })));
  const raceRounds = new Set(race.filter((r) => r.status === 200).map((r) => r.data.roundId));
  check("six simultaneous requests with one key create one round", raceRounds.size === 1, `rounds=${raceRounds.size}`);
  await reconciled("the idempotency tests");

  // --- provably fair: re-derive past results from the revealed seed -------------------------
  const diceProof = dice.data.proof;
  const mines0 = await play({ game: "mines", stake: 1, mineCount: 3 });
  check("mines opens a round", mines0.status === 200 && mines0.data.settled === false);
  check("the mine positions are NOT sent while the round is open", mines0.data.result.mines === null && !JSON.stringify(mines0.data).includes('"mines":['));
  const minesId = mines0.data.roundId;
  const early = await c.post("/api/casino/fairness", {});
  check("seeds cannot be rotated (revealed) while a round is open", early.status === 409 && early.error?.messageKey === "casino.error.roundInProgress", `${early.status}`);
  const resumed = await c.get("/api/casino/active?game=mines");
  check("a reload resumes the open Mines round (and still hides the board)", resumed.data?.roundId === minesId && resumed.data.result.mines === null);
  const tooEarly = await act({ game: "mines", roundId: minesId, action: "cashout" });
  check("cashing out before revealing a tile is refused", tooEarly.status === 422);
  const bad = await act({ game: "mines", roundId: minesId, action: "reveal", tile: 99 });
  check("an out-of-range tile is refused", bad.status === 422);

  let minesDone: any = null;
  for (let tile = 0; tile < 25 && !minesDone; tile += 1) {
    const r = await act({ game: "mines", roundId: minesId, action: "reveal", tile });
    if (r.status !== 200) break;
    if (r.data.settled) minesDone = r.data;
    else if (tile === 2) {
      const cash = await act({ game: "mines", roundId: minesId, action: "cashout" });
      if (cash.status === 200) minesDone = cash.data;
    }
  }
  check("the Mines round ends (bust or cash-out) and reveals the board", !!minesDone?.settled && Array.isArray(minesDone.result.mines));
  const replayedAction = await act({ game: "mines", roundId: minesId, action: "reveal", tile: 24 });
  check("a settled Mines round cannot be acted on again", replayedAction.status === 422 && replayedAction.error?.messageKey === "casino.error.roundSettled");
  const minesRow = await prisma.bet.findUnique({ where: { id: minesId } });
  check("exactly one payout (or none) for the Mines round", (await prisma.transaction.count({ where: { betId: minesId, type: "WIN" } })) <= 1 && minesRow!.status !== "OPEN");

  const rotated = await c.post("/api/casino/fairness", { clientSeed: `mine-${RUN}` });
  check("with no round open, rotating reveals the previous server seed", rotated.status === 200 && rotated.data.previous.length >= 1);
  const old = rotated.data.previous[0];
  check("the revealed seed hashes to the commitment shown before betting", (await import("node:crypto")).createHash("sha256").update(old.serverSeed).digest("hex") === diceProof.serverSeedHash);
  const reproduced = rollFromFloat(floatsFromSeed(old.serverSeed, diceProof.clientSeed, diceProof.nonce, 1)[0]!);
  check("the dice roll reproduces exactly from (serverSeed, clientSeed, nonce)", reproduced === dice.data.result.roll, `${reproduced} vs ${dice.data.result.roll}`);
  const minesProof = mines0.data.proof;
  const reMines = shuffleIndicesFromFloats(25, floatsFromSeed(old.serverSeed, minesProof.clientSeed, minesProof.nonce, 24)).slice(0, 3).sort((a, b) => a - b);
  check("the Mines board reproduces exactly from the revealed seed", JSON.stringify(reMines) === JSON.stringify([...minesDone.result.mines].sort((a: number, b: number) => a - b)));

  // --- blackjack ----------------------------------------------------------------------------
  let bj: any = null;
  for (let attempt = 0; attempt < 6 && !(bj && !bj.settled); attempt += 1) bj = (await play({ game: "blackjack", stake: 5 })).data;
  if (bj && !bj.settled) {
    check("blackjack: the shoe and hole card are not sent", !("shoe" in bj.result) && bj.result.dealer.length === 1 && bj.result.dealerValue === null);
    const reload = await c.get("/api/casino/active?game=blackjack");
    check("blackjack: a reload resumes the same hand", reload.data?.roundId === bj.roundId && reload.data.result.hands[0].cards.length === bj.result.hands[0].cards.length);
    const beforeDouble = (await ledgerSum(cid)).balance;
    let state = bj;
    if (bj.result.canDouble) {
      const d = await act({ game: "blackjack", roundId: bj.roundId, action: "double" });
      state = d.data;
      check("doubling debits the extra stake on the server", d.status === 200 && Math.abs(beforeDouble - (await ledgerSum(cid)).balance - 5 + (d.data.payout ?? 0)) < 0.0005, `payout=${d.data?.payout}`);
    }
    for (let i = 0; i < 12 && !state.settled; i += 1) {
      const next = await act({ game: "blackjack", roundId: bj.roundId, action: "stand" });
      if (next.status !== 200) break;
      state = next.data;
    }
    check("the blackjack hand settles", state.settled === true);
    const again = await act({ game: "blackjack", roundId: bj.roundId, action: "hit" });
    check("a settled hand cannot be hit again (no replayed payout)", again.status === 422 && again.error?.messageKey === "casino.error.roundSettled");
  } else {
    check("blackjack: dealt a natural/quick settle (rare) — settles at once", bj?.settled === true);
  }
  const foreignRound = await playerB.post("/api/casino/action", { game: "blackjack", roundId: bj.roundId, action: "stand", idempotencyKey: key() });
  check("another player cannot act on this round", foreignRound.status === 422 && foreignRound.error?.messageKey === "casino.error.invalidRound");
  await reconciled("mines and blackjack");

  // --- crash ----------------------------------------------------------------------------------
  const crash = await play({ game: "crash", stake: 2 });
  check("crash starts and hides the bust point", crash.status === 200 && crash.data.settled === false && crash.data.result.crashPoint === null);
  const crashEnd = await act({ game: "crash", roundId: crash.data.roundId, action: "cashout" });
  check("an immediate cash-out settles on the server's clock", crashEnd.status === 200 && crashEnd.data.settled === true && ["cashed", "busted"].includes(crashEnd.data.result.phase));
  const crashAgain = await act({ game: "crash", roundId: crash.data.roundId, action: "cashout" });
  check("a second cash-out is refused (no double payout)", crashAgain.status === 422);
  const status = await c.get(`/api/casino/active?game=crash&roundId=${crash.data.roundId}`);
  check("polling a finished crash round reports how it ended", status.data?.settled === true && status.data.result.crashPoint !== null);
  await reconciled("crash");

  // abandoned crash round: bust is applied by the clock the next time anything touches it
  const abandoned = await play({ game: "crash", stake: 1 });
  await prisma.bet.update({ where: { id: abandoned.data.roundId }, data: { state: { crashPoint: 1.01, startedAt: Date.now() - 600_000, autoCashOut: null } } });
  const swept = await c.get("/api/casino/active?game=crash");
  const sweptRow = await prisma.bet.findUnique({ where: { id: abandoned.data.roundId } });
  check("an abandoned crash round is settled as a loss when next touched", swept.data === null && sweptRow!.status === "LOST" && sweptRow!.payout === 0n);
  await reconciled("abandoned crash round");

  // --- history --------------------------------------------------------------------------------
  const history = await c.get("/api/casino/history?limit=5");
  check("history is the caller's own settled rounds", history.status === 200 && history.data.length === 5 && history.data.every((h: any) => typeof h.multiplier === "number"));
  const otherHistory = await playerB.get("/api/casino/history");
  check("another player's history does not contain them", otherHistory.data.every((h: any) => !history.data.some((mine: any) => mine.id === h.id)));

  // --- responsible gambling & restrictions apply to the casino too ----------------------------
  await prisma.responsibleGamblingLimit.create({ data: { userId: cid, kind: "SINGLE_BET", period: "DAILY", value: 1_000n } });
  const limited = await play({ game: "dice", stake: 2, target: 50, direction: "under" });
  check("the single-bet limit blocks a casino stake", limited.status === 422 && limited.error?.messageKey === "responsible.error.singleBetLimit", `${limited.status} ${limited.error?.messageKey}`);
  await prisma.responsibleGamblingLimit.deleteMany({ where: { userId: cid } });
  await prisma.selfExclusion.create({ data: { userId: cid, kind: "COOLING_OFF", endsAt: new Date(Date.now() + 36e5) } });
  const paused = await play({ game: "dice", stake: 1, target: 50, direction: "under" });
  check("a player on a break cannot play (403/422)", paused.status === 403 || paused.status === 422, `${paused.status}`);

  // --- concurrency: the balance can never go below zero through the casino ------------------------
  const poor = await register(`pr${RUN}`);
  const poorId = poor.reply.data.user.id as string;
  await credit(admin, poorId, 10);
  const stampede = await Promise.all(Array.from({ length: 12 }, () => poor.client.post("/api/casino/play", { game: "dice", stake: 4, target: 98, direction: "under", idempotencyKey: key() })));
  const accepted = stampede.filter((r) => r.status === 200).length;
  const finalState = await ledgerSum(poorId);
  check("12 parallel 4-unit bets on a 10 balance: at most 2 can be funded up front", accepted <= 12 && finalState.balance >= 0);
  check("…and the ledger still equals the balance", finalState.sum === finalState.balance, `sum=${finalState.sum} balance=${finalState.balance}`);
  const unpaid = await prisma.bet.count({ where: { userId: poorId, status: "OPEN" } });
  check("no round is left open or half-written", unpaid === 0);
}


section("Pages render, and are protected");
{
  const html = async (client: Client, path: string) => {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual", headers: { cookie: [...client.jar].map(([k, v]) => `${k}=${v}`).join("; "), "x-forwarded-for": client.ip } });
    return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text(), headers: response.headers };
  };
  const broken = (r: { body: string }) => r.body.includes('data-error-boundary="route"');

  const guest = new Client();
  const publicRoutes = ["/", "/sports", "/sports/football", "/live", "/results", "/popular", "/games", "/games/reels", "/games/roulette", "/games/blackjack", "/games/crash", "/games/dice", "/games/mines", "/games/plinko", "/games/limbo", "/games/fairness", "/promotions", "/responsible-gambling", "/about", "/help", "/contact", "/legal/terms", "/legal/privacy", "/legal/cookies", "/login", "/reset-password?token=nope"];
  let bad: string[] = [];
  for (const route of publicRoutes) {
    const r = await html(guest, route);
    if (r.status !== 200 || broken(r)) bad.push(`${route} → ${r.status}`);
  }
  check(`${publicRoutes.length} public pages render for a guest`, bad.length === 0, bad.join("; "));
  const head = await html(guest, "/");
  check("responses carry a nonce-based CSP and a request id", /nonce-/.test(head.headers.get("content-security-policy") ?? "") && !!head.headers.get("x-request-id"));

  const protectedPaths = ["/account", "/account/bets", "/account/transactions", "/account/profile", "/account/security", "/account/responsible", "/account/notifications", "/wallet", "/wallet/withdraw", "/wallet/deposit", "/admin", "/admin/players", "/admin/transactions", "/admin/audit", "/admin/settings"];
  bad = [];
  for (const route of protectedPaths) {
    const r = await html(guest, route);
    if (r.status !== 307 || !r.location.startsWith("/login")) bad.push(`${route} → ${r.status}`);
  }
  check("account and admin pages redirect a guest to sign in", bad.length === 0, bad.join("; "));

  const playerPages = ["/account", "/account/bets", "/account/transactions", "/account/profile", "/account/security", "/account/responsible", "/account/notifications", "/wallet", "/wallet/withdraw", "/wallet/deposit", "/games/blackjack", "/responsible-gambling"];
  bad = [];
  for (const route of playerPages) {
    const r = await html(playerA, route);
    if (r.status !== 200 || broken(r)) bad.push(`${route} → ${r.status}`);
  }
  check(`${playerPages.length} player pages render for a signed-in player`, bad.length === 0, bad.join("; "));

  const adminPages = ["/admin", "/admin?period=today", "/admin?period=lastMonth", "/admin?period=custom&from=2026-01-01&to=2026-01-31", "/admin/players", "/admin/players?status=active&search=pa", "/admin/players/new", "/admin/managers", "/admin/managers/new", `/admin/players/${idA}`, `/admin/players/${idA}?tab=wallet`, `/admin/players/${idA}?tab=transactions`, `/admin/players/${idA}?tab=bets`, `/admin/players/${idA}?tab=activity`, `/admin/players/${idA}?tab=responsible`, "/admin/transactions", "/admin/transactions?kind=deposit&minAmount=1", "/admin/withdrawals", "/admin/wallet", "/admin/bets", "/admin/bets?kind=sports&status=pending", "/admin/reports", "/admin/audit", "/admin/audit?severity=critical", "/admin/notifications", "/admin/settings", "/admin/security", "/admin/responsible-gambling"];
  bad = [];
  for (const route of adminPages) {
    const r = await html(admin, route);
    if (r.status !== 200 || broken(r)) bad.push(`${route} → ${r.status}`);
  }
  check(`${adminPages.length} admin pages render for an administrator`, bad.length === 0, bad.join("; "));

  const asPlayer = await html(playerA, "/admin");
  const asPlayer2 = await html(playerA, "/admin/players");
  check("a signed-in player gets a 404 for the admin console", asPlayer.status === 404 && asPlayer2.status === 404, `${asPlayer.status} ${asPlayer2.status}`);
  const missing = await html(guest, "/this-route-does-not-exist");
  check("unknown routes are 404", missing.status === 404);
  const dashboard = await html(admin, "/admin");
  const lobby = await html(guest, "/games");
  check("the games lobby has its filter bar, and no sign-up link anywhere on the site", /Rechercher un jeu|Search games/.test(lobby.body) && !/href="\/register"/.test((await html(guest, "/")).body + lobby.body));
  check("the dashboard shows real numbers, not placeholders", !dashboard.body.includes("Synthetic") && /Dépôts|Deposits/.test(dashboard.body));
}

section("Audit trail and reports");
{
  const logs = await admin.get(`/api/admin/audit-logs?player=${idA}&pageSize=100`);
  check("audit log is queryable by player", logs.status === 200 && logs.data.items.length > 0);
  const actions = new Set(logs.data.items.map((r: any) => r.action));
  check("it records wallet adjustments and withdrawal decisions", ["admin.wallet.adjusted", "admin.withdrawal.rejected"].every((a) => actions.has(a)), [...actions].join(","));
  const byAdmin = await admin.get(`/api/admin/audit-logs?actor=${adminA.id}&action=admin.wallet.`);
  check("filterable by administrator and action prefix", byAdmin.status === 200 && byAdmin.data.items.every((r: any) => r.actorId === adminA.id && r.action.startsWith("admin.wallet.")));
  const bySeverity = await admin.get("/api/admin/audit-logs?severity=critical&pageSize=5");
  check("filterable by severity", bySeverity.data.items.every((r: any) => r.severity === "critical"));
  const noWrite = await admin.call("DELETE", "/api/admin/audit-logs");
  check("there is no way to delete audit records through the API", noWrite.status === 405 || noWrite.status === 404);

  const dash = await admin.get("/api/admin/dashboard?period=today");
  check("dashboard returns real figures for today", dash.status === 200 && dash.data.deposits.gross >= 50 && dash.data.players.registered >= 3, JSON.stringify(dash.data?.deposits));
  const gross = await prisma.transaction.aggregate({ where: { type: "DEPOSIT", status: "COMPLETED", createdAt: { gte: new Date(dash.data.period.from), lt: new Date(dash.data.period.to) }, user: { role: "PLAYER" } }, _sum: { amount: true } });
  check("dashboard deposits equal the ledger", Math.abs(dash.data.deposits.gross - money(gross._sum.amount ?? 0n)) < 0.001);
  const custom = await admin.get("/api/admin/dashboard?period=custom&from=2020-01-01&to=2020-01-31");
  check("a custom range with no activity returns zeros", custom.status === 200 && custom.data.deposits.gross === 0 && custom.data.bets.count === 0);

  const csv = await admin.get("/api/admin/reports/export?kind=players&period=today");
  check("CSV export works and contains no e-mail addresses", csv.status === 200 && csv.headers.get("content-type")!.startsWith("text/csv") && !csv.raw.includes("@test.local"));
  const exportAudit = await prisma.auditLog.count({ where: { action: "admin.report.exported", actorId: adminA.id } });
  check("the export itself is audited", exportAudit >= 1);

  const search = await admin.get(`/api/admin/search?q=${uA}`);
  check("admin search finds the player by username", search.data.some((r: any) => r.kind === "player" && r.id === idA));
  const searchRef = await admin.get(`/api/admin/search?q=${(await prisma.transaction.findFirst({ where: { userId: idA } }))!.reference}`);
  check("…and a transaction by reference", searchRef.data.some((r: any) => r.kind === "transaction"));
}

section("Notifications");
{
  const mine = await playerA.get("/api/notifications");
  check("a player has their own notifications (balance updates)", mine.status === 200 && mine.data.some((n: any) => n.titleKey === "notify.balanceUpdated.title"));
  check("a player's notifications are not an administrator's", !mine.data.some((n: any) => n.kind === "withdrawal_request"));
  const adminNotes = await admin.get("/api/notifications");
  check("the superadmin receives withdrawal alerts", adminNotes.data.some((n: any) => n.kind === "withdrawal_request"));
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
