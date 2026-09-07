#!/usr/bin/env bash
# Requests every route and reports anything that is not a clean 200.
# Dynamic routes never prerender, so `next build` cannot catch a runtime
# failure in one — this is the check that does.
set -u
BASE="${1:-http://localhost:3000}"

ROUTES=(
  / /sports /sports/football /sports/basketball /sports/tennis /sports/handball
  /sports/volleyball /sports/rugby /sports/boxing /sports/formula1
  /live /results /search "/search?q=esperance" /popular
  /games /games/reels /games/roulette /games/blackjack /games/crash /games/dice /games/mines /games/plinko /games/limbo /games/fairness
  /promotions /responsible-gambling
  /about /help /contact /legal/terms /legal/privacy /legal/cookies
  /login /register /forgot-password
  /account /account/bets /account/transactions /account/notifications
  /account/profile /account/security /account/responsible
  /wallet /wallet/deposit /wallet/withdraw /wallet/history
  /admin /admin/users /admin/events /admin/sports /admin/competitions
  /admin/bets /admin/transactions /admin/promotions /admin/reports
  /admin/responsible-gambling /admin/settings /admin/games
  /api/sports /api/competitions /api/events /api/odds /api/results
  "/api/search?q=esperance" /api/wallet /api/account /api/bets /api/transactions
  /api/games /api/games/providers /api/games/crash /api/games/slots-video
  /api/casino/session /api/casino/history
  /this-route-does-not-exist
)

fail=0

# --- security headers -------------------------------------------------------
# The proxy lived at the repo root for most of this project's life. Next
# resolves it inside src/ when a src/ directory exists, so it was never invoked
# and NO Content-Security-Policy was ever sent — while every page still
# returned 200 and looked perfectly healthy. Absence of a security header is
# invisible unless something asserts on it.
headers=$(curl -s -D - -o /dev/null "$BASE/")
for header in "content-security-policy" "x-request-id" "x-frame-options"; do
  if ! grep -qi "^$header:" <<<"$headers"; then
    printf '  ✗ %-42s missing response header: %s\n' "/" "$header"
    fail=$((fail + 1))
  fi
done

if grep -qi "^content-security-policy:.*nonce-" <<<"$headers"; then
  :
else
  printf '  ✗ %-42s CSP carries no nonce\n' "/"
  fail=$((fail + 1))
fi

for route in "${ROUTES[@]}"; do
  code=$(curl -s -o /tmp/sportgo-smoke.out -w "%{http_code}" "$BASE$route")
  note=""
  # A 200 that renders the error boundary is still a failure.
  if grep -q 'data-error-boundary="route"' /tmp/sportgo-smoke.out 2>/dev/null; then
    note=" ERROR BOUNDARY"
  fi

  case "$route:$code" in
    /this-route-does-not-exist:404) ;;                       # expected
    /api/account:401|/api/bets:401|/api/transactions:401|/api/wallet:401) ;;  # auth guard
    /api/odds:422) ;;                                        # eventId is required
    *:200) ;;
    *) note="$note UNEXPECTED";;
  esac

  if [ -n "$note" ]; then
    printf '  ✗ %-42s %s%s\n' "$route" "$code" "$note"
    fail=$((fail + 1))
  fi
done

if [ "$fail" -eq 0 ]; then
  echo "✓ all ${#ROUTES[@]} routes responded as expected"
else
  echo "✗ $fail route(s) failed"
  exit 1
fi
