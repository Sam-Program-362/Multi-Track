#!/usr/bin/env bash
#
# Creates the ONE permanent signing key for Multi-Track.
#
# Run this exactly once. The key it produces is what makes every future build
# install as an update over the previous one, so it has to be the same key
# forever. If it is lost, the app can never be updated again.
#
#   sh ./scripts/create-signing-key.sh
#
# The keystore is written outside the repository (default: $HOME/multitrack-release.jks)
# so it can never be committed by accident. Back it up somewhere safe - a password
# manager file attachment is ideal.

# POSIX-only on purpose, so `sh ./scripts/create-signing-key.sh` works on dash too.
set -eu

ALIAS="multitrack"
KEYSTORE="${KEYSTORE:-$HOME/multitrack-release.jks}"
REPO="Sam-Program-362/Multi-Track"

die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\033[32m%s\033[0m\n' "$*"; }

command -v keytool >/dev/null 2>&1 || die "keytool not found. Install a JDK (17 or newer) and try again."

# The single most destructive mistake possible here is generating a fresh key
# over an existing one, because that silently breaks updates for everyone who
# already has the app. Refuse unconditionally.
if [ -e "$KEYSTORE" ]; then
  die "Keystore already exists at $KEYSTORE - refusing to overwrite it.
The permanent key must never be regenerated. Back up this file and keep using it."
fi

if [ ! -d "$(dirname "$KEYSTORE")" ]; then
  die "The folder $(dirname "$KEYSTORE") does not exist."
fi

# Passwords: reuse the ones you pass in, otherwise make strong random ones.
STORE_PASSWORD="${KEYSTORE_PASSWORD:-$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)}"
KEY_PASSWORD="${KEY_PASSWORD:-$STORE_PASSWORD}"

printf 'Creating a new permanent signing key.\n\n'
printf '  keystore : %s\n' "$KEYSTORE"
printf '  alias    : %s\n' "$ALIAS"
printf '  valid    : 10000 days (~27 years)\n\n'

keytool -genkeypair -noprompt \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$STORE_PASSWORD" -keypass "$KEY_PASSWORD" \
  -dname "CN=Multi-Track, O=Sam Program, C=BD"

chmod 600 "$KEYSTORE"

# Fail loudly here rather than three failed CI runs later.
keytool -list -keystore "$KEYSTORE" \
  -storepass "$STORE_PASSWORD" -alias "$ALIAS" >/dev/null

B64="$(base64 < "$KEYSTORE" | tr -d '\n')"

say "Key created."
printf '\n'
printf 'Back this up now, before doing anything else:\n'
printf '  cp %s somewhere-you-trust/\n\n' "$KEYSTORE"

printf 'Passwords (write these down next to the keystore):\n'
printf '  KEYSTORE_PASSWORD = %s\n' "$STORE_PASSWORD"
printf '  KEY_ALIAS         = %s\n' "$ALIAS"
printf '  KEY_PASSWORD      = %s\n\n' "$KEY_PASSWORD"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  printf 'Uploading the four secrets to %s ...\n\n' "$REPO"
  printf '%s' "$B64"      | gh secret set KEYSTORE_BASE64   --repo "$REPO"
  printf '%s' "$STORE_PASSWORD" | gh secret set KEYSTORE_PASSWORD --repo "$REPO"
  printf '%s' "$ALIAS"    | gh secret set KEY_ALIAS         --repo "$REPO"
  printf '%s' "$KEY_PASSWORD"  | gh secret set KEY_PASSWORD   --repo "$REPO"
  say "Secrets uploaded."
  printf '\nTrigger a signed build with:\n  gh workflow run android-apk.yml --repo %s\n' "$REPO"
else
  printf 'The GitHub CLI is not available or not logged in, so upload the secrets yourself:\n\n'
  printf '  gh secret set KEYSTORE_BASE64   --repo %s   < release.jks.base64\n' "$REPO"
  printf '  gh secret set KEYSTORE_PASSWORD --repo %s\n' "$REPO"
  printf '  gh secret set KEY_ALIAS         --repo %s\n' "$REPO"
  printf '  gh secret set KEY_PASSWORD      --repo %s\n\n' "$REPO"
  printf 'The value for KEYSTORE_BASE64 is the base64 of the whole keystore file:\n\n'
  printf '  base64 < %s | tr -d "\\n"\n' "$KEYSTORE"
fi

printf '\nNever commit %s and never regenerate it.\n' "$KEYSTORE"