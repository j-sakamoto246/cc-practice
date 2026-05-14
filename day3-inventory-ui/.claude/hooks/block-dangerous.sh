#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"

command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if [[ -z "$command" ]]; then
  exit 0
fi

if printf '%s' "$command" | grep -Eq '(^|[^[:alnum:]_])rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[[:space:]]+-[a-zA-Z]*[fF][a-zA-Z]*|-[a-zA-Z]*[fF][a-zA-Z]*[[:space:]]+-[a-zA-Z]*[rR][a-zA-Z]*|-[a-zA-Z]*[rRfF][a-zA-Z]*[rRfF][a-zA-Z]*)'; then
  echo "BLOCKED: 'rm -rf' は危険なため実行できません: $command" >&2
  exit 2
fi

if printf '%s' "$command" | grep -Eq 'git[[:space:]]+push[[:space:]]+.*(--force([[:space:]]|=|$)|-f([[:space:]]|$))'; then
  echo "BLOCKED: 'git push --force' は危険なため実行できません: $command" >&2
  exit 2
fi

exit 0
