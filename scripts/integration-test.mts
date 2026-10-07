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

async function provisionAdmin(label: string) {
  const username = `t${RUN}${label}`;
  const email = `${username}@test.local`;
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await createHasher().hash(PASSWORD),
      role: "ADMIN",
      status: "ACTIVE",
      profile: { create: { displayName: username, firstName: "Test", lastName: "Admin" } },
    },
  });
  return { id: user.id, username, email };
}

async function ledgerSum(userId: string) {
  const sum = await prisma.transaction.aggregate({ where: { userId }, _sum: { amount: true } });
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  return { sum: money(sum._sum.amount ?? 0n), balance: money(wallet?.balance ?? 0n) };
}

async function register(username: string, extra: Record<string, unknown> = {}) {
  const client = await new Client().init();
  const reply = await client.post("/api/auth/register", {
    username,
    firstName: "Test",
    lastName: "Player",
    email: `${username}@test.local`,
    phone: "20123456",
    password: PASSWORD,
    confirmPassword: PASSWORD,
    dateOfBirth: "1990-05-05",
    country: "TN",
    ageConfirmed: true,
    termsAccepted: true,
    ...extra,
  });
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

const adminA = await provisionAdmin("a");
const adminB = await provisionAdmin("b");

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

section("Registration");
const uA = `pa${RUN}`;
const uB = `pb${RUN}`;
const { client: playerA, reply: regA } = await register(uA);
check("player A registers (201) and is signed in", regA.status === 201, JSON.stringify(regA.error));
const idA = regA.data?.user?.id as string;
const { client: playerB, reply: regB } = await register(uB);
const idB = regB.data?.user?.id as string;
check("player B registers", regB.status === 201);
{
  const dupe = await register(uA, { email: `other-${uA}@test.local` });
  check("duplicate username refused with a field error", dupe.reply.status === 422 && dupe.reply.error?.fields?.some((f) => f.field === "username"));
  const dupeMail = await register(`x${uA}`, { email: `${uA}@test.local` });
  check("duplicate e-mail refused", dupeMail.reply.status === 422 && dupeMail.reply.error?.fields?.some((f) => f.field === "email"));
  const under = await register(`u${RUN}`, { dateOfBirth: new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10) });
  check("under-age date of birth refused server-side", under.reply.status === 422);
  const weak = await register(`w${RUN}`, { password: "password1234", confirmPassword: "password1234" });
  check("weak password refused", weak.reply.status === 422);
  const escalate = await register(`e${RUN}`, { role: "ADMIN", status: "ACTIVE", balance: 1_000_000 });
  const row = await prisma.user.findUnique({ where: { id: escalate.reply.data?.user?.id }, include: { wallet: true } });
  check("mass assignment: role / balance in the body are ignored", row?.role === "PLAYER" && (row?.wallet?.balance ?? 0n) === 0n);
}
{
  const me = await playerA.get("/api/account");
  check("GET /api/account returns the player's own overview", me.status === 200 && me.data.user.id === idA);
  check("new wallet starts at zero", me.data.wallet.balance === 0);
  const stored = await prisma.user.findUnique({ where: { id: idA } });
  check("password is stored as an Argon2id hash, never plaintext", stored!.passwordHash.startsWith("$argon2id$") && !stored!.passwordHash.includes(PASSWORD));
}

section("Sign-in, lockout and enumeration resistance");
{
  const c = await new Client().init();
  const unknown = await c.login(`nobody${RUN}`, PASSWORD);
  const wrong = await c.login(uA, "Wrong-password-1");
  check("unknown user and wrong password give the same status + message", unknown.status === 401 && wrong.status === 401 && unknown.error?.messageKey === wrong.error?.messageKey);
  const okLogin = await c.login(uA, PASSWORD);
  check("correct credentials sign in", okLogin.status === 200 && okLogin.data.user.id === idA);
  const byEmail = await (await new Client().init()).login(`${uA}@test.local`, PASSWORD);
  check("sign-in by e-mail works", byEmail.status === 200);

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
check("admin signs in", login.status === 200 && login.data.user.role === "admin", JSON.stringify(login.error));
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
    ["POST", "/api/admin/players", { username: "hacker1", email: "h@x.io", firstName: "Ha", lastName: "Cker", country: "TN", credentialMode: "invitation" }],
    ["POST", "/api/admin/wallet/adjustments", { playerId: idA, type: "ADMIN_CREDIT", amount: 100, reason: "free money", confirm: true }],
    ["POST", `/api/admin/players/${idB}/status`, { action: "suspend", reason: "because", confirm: true }],
    ["POST", `/api/admin/players/${idB}/credential-link`, {}],
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
  const off = await admin.call("PATCH", "/api/admin/settings", { "players.registrationEnabled": false });
  check("administrator closes registration", off.status === 200);
  const closed = await register(`cl${RUN}`);
  check("registration is refused while closed", closed.reply.status === 422 && closed.reply.error?.messageKey === "auth.error.registrationClosed", `${closed.reply.status} ${closed.reply.error?.messageKey}`);
  await admin.call("PATCH", "/api/admin/settings", { "players.registrationEnabled": true });
  const unknownKey = await admin.call("PATCH", "/api/admin/settings", { "evil.setting": true });
  check("an unknown setting key is rejected, not stored", unknownKey.status === 422);
  const outOfRange = await admin.call("PATCH", "/api/admin/settings", { "security.maxFailedLogins": 9999 });
  check("an out-of-range value is rejected", outOfRange.status === 422);

  await admin.call("PATCH", "/api/admin/settings", { "general.maintenanceMode": true });
  const blocked = await (await new Client().init()).login(uB, PASSWORD);
  const adminOk = await (await new Client().init()).login(adminA.username, PASSWORD);
  check("maintenance mode blocks players from signing in, but not administrators", blocked.status === 401 && adminOk.status === 200);
  await admin.call("PATCH", "/api/admin/settings", { "general.maintenanceMode": false });
}

section("Invitation and password flows");
{
  const created = await admin.post("/api/admin/players", {
    username: `inv${RUN}`, email: `inv${RUN}@test.local`, firstName: "Invited", lastName: "Person", country: "TN", locale: "fr", credentialMode: "invitation",
  });
  check("admin creates a player by invitation", created.status === 201 && !!created.data.invitationLink, JSON.stringify(created.error));
  const link: string = created.data.invitationLink;
  const token = new URL(link).searchParams.get("token")!;
  const stored = await prisma.passwordToken.findFirst({ where: { userId: created.data.playerId } });
  check("the invitation token is stored only as a hash", !!stored && stored.tokenHash !== token);
  const pre = await (await new Client().init()).login(`inv${RUN}`, PASSWORD);
  check("an invited account cannot sign in before accepting", pre.status === 401);
  const c = await new Client().init();
  const bad = await c.post("/api/auth/password/reset", { token, password: "short", confirmPassword: "short" });
  check("accepting with a weak password is refused", bad.status === 422);
  const accept = await c.post("/api/auth/password/reset", { token, password: PASSWORD, confirmPassword: PASSWORD });
  check("accepting the invitation sets the password", accept.status === 200, JSON.stringify(accept.error));
  const reuse = await c.post("/api/auth/password/reset", { token, password: PASSWORD + "x", confirmPassword: PASSWORD + "x" });
  check("the link is single-use", reuse.status === 422);
  const nowIn = await (await new Client().init()).login(`inv${RUN}`, PASSWORD);
  check("the account is active and signs in", nowIn.status === 200);

  const known = await (await new Client().init()).post("/api/auth/password/forgot", { email: `inv${RUN}@test.local` });
  const unknown = await (await new Client().init()).post("/api/auth/password/forgot", { email: `ghost${RUN}@test.local` });
  check("forgot-password answers identically for known and unknown addresses", known.status === unknown.status && JSON.stringify(known.data) === JSON.stringify(unknown.data));

  const pwd = await new Client().init();
  await pwd.login(`inv${RUN}`, PASSWORD);
  const second = await new Client().init();
  await second.login(`inv${RUN}`, PASSWORD);
  const NEW = `${PASSWORD}-new1`;
  const wrongCurrent = await pwd.post("/api/auth/password/change", { currentPassword: "nope", newPassword: NEW, confirmPassword: NEW });
  check("changing a password requires the current one", wrongCurrent.status === 422);
  const changed = await pwd.post("/api/auth/password/change", { currentPassword: PASSWORD, newPassword: NEW, confirmPassword: NEW });
  check("password change succeeds", changed.status === 200, JSON.stringify(changed.error));
  check("…and ends the user's other sessions", (await second.get("/api/account")).status === 401);
  check("…while the current session keeps working", (await pwd.get("/api/account")).status === 200);
  check("the new password works", (await (await new Client().init()).login(`inv${RUN}`, NEW)).status === 200);

  const forced = await admin.post("/api/admin/players", {
    username: `fp${RUN}`, email: `fp${RUN}@test.local`, firstName: "Forced", lastName: "Change", country: "TN", locale: "fr", credentialMode: "password", temporaryPassword: PASSWORD,
  });
  const fc = await new Client().init();
  await fc.login(`fp${RUN}`, PASSWORD);
  const blockedUntilChange = await fc.get("/api/account");
  check("a temporary-password account is blocked until the password is changed", blockedUntilChange.status === 403 && blockedUntilChange.error?.messageKey === "auth.error.passwordChangeRequired", `${blockedUntilChange.status} ${blockedUntilChange.error?.messageKey}`);
  void forced;
}

section("Audit trail and reports");
{
  const logs = await admin.get(`/api/admin/audit-logs?player=${idA}&pageSize=100`);
  check("audit log is queryable by player", logs.status === 200 && logs.data.items.length > 0);
  const actions = new Set(logs.data.items.map((r: any) => r.action));
  check("it records registration, wallet adjustments and withdrawal decisions", ["auth.register", "admin.wallet.adjusted", "admin.withdrawal.rejected"].every((a) => actions.has(a)), [...actions].join(","));
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
  check("a player's notifications are not an administrator's", !mine.data.some((n: any) => n.kind === "new_player"));
  const adminNotes = await admin.get("/api/notifications");
  check("administrators receive new-player and withdrawal alerts", adminNotes.data.some((n: any) => n.kind === "new_player") && adminNotes.data.some((n: any) => n.kind === "withdrawal_request"));
}

console.log(`\n${failures === 0 ? "✓" : "✗"} ${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ""}\n`);
await prisma.$disconnect();
process.exit(failures === 0 ? 0 : 1);
