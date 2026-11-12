#!/usr/bin/env bash
# Veilleur du site public — vérifie que l'URL du concours est vivante :
#   1. la page d'accueil répond HTTP 200 ;
#   2. le HTML contient la marque du produit (« Ghost Hours », présente dans
#      le <title> et la <meta description> de apps/web/index.html) ;
#   3. au moins un asset réel du bundle (chemin extrait du HTML récupéré)
#      répond HTTP 200.
# Toute anomalie => sortie non nulle => job rouge + annotation ::error::.
# Réglages par variables d'environnement : SITE_URL, SITE_MARKER, CURL_TIMEOUT.
set -euo pipefail

SITE_URL="${SITE_URL:-https://tradoooo.github.io/ghost-hours/}"
SITE_MARKER="${SITE_MARKER:-Ghost Hours}"
CURL_TIMEOUT="${CURL_TIMEOUT:-30}"
HTML_FILE="$(mktemp)"
trap 'rm -f "$HTML_FILE"' EXIT

# Message d'échec explicite : quoi faire pour rétablir le site.
fail() {
  echo "::error::site KO — $1"
  echo "Que faire : relancer le workflow « Deploy (GitHub Pages) » (.github/workflows/deploy.yml)"
  echo "depuis main, ou republier la branche gh-pages. L'URL $SITE_URL doit rester"
  echo "vivante et gratuite jusqu'au 29/01/2027 (règlement du concours Kiroween)."
  exit 1
}

http_get() { # $1 = URL, $2 = fichier de sortie ; affiche le code HTTP
  local code
  code=$(curl -sS -L --max-time "$CURL_TIMEOUT" -o "$2" -w '%{http_code}' "$1") \
    || fail "impossible de charger $1 (curl en échec, code $?)"
  printf '%s' "$code"
}

check_home() {
  local code
  code=$(http_get "$SITE_URL" "$HTML_FILE")
  [ "$code" = "200" ] || fail "HTTP $code au lieu de 200 sur $SITE_URL"
  grep -qi "$SITE_MARKER" "$HTML_FILE" \
    || fail "la marque « $SITE_MARKER » est absente du HTML : la page servie n'est pas Ghost Hours"
  echo "accueil OK : HTTP 200, marque « $SITE_MARKER » présente"
}

# Extrait le premier chemin d'asset du bundle (…/assets/…) référencé dans le
# HTML et le résout en URL absolue (le build Vite publie des chemins absolus
# préfixés par /ghost-hours/, mais on tolère aussi relatif et URL complète).
asset_url() {
  local path origin
  path=$(grep -oE '(src|href)="[^"]*assets/[^"]+"' "$HTML_FILE" \
    | head -n 1 | sed -E 's/^(src|href)="//; s/"$//') || true
  [ -n "$path" ] || fail "aucun asset (assets/…) référencé dans le HTML récupéré"
  case "$path" in
    http*) printf '%s' "$path" ;;
    /*)
      origin=$(printf '%s' "$SITE_URL" | grep -oE '^https?://[^/]+')
      printf '%s%s' "$origin" "$path"
      ;;
    *) printf '%s%s' "$SITE_URL" "${path#./}" ;;
  esac
}

check_asset() {
  local url code
  url=$(asset_url)
  code=$(http_get "$url" /dev/null)
  [ "$code" = "200" ] || fail "l'asset $url répond HTTP $code au lieu de 200"
  echo "asset OK : $url (HTTP 200)"
}

check_home
check_asset
echo "site vivant : $SITE_URL"
