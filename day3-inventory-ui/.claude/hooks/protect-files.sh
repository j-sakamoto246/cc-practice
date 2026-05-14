#!/usr/bin/env bash
set -euo pipefail

input="$(cat)"

file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"

if [[ -z "$file_path" ]]; then
  exit 0
fi

basename="${file_path##*/}"

case "$basename" in
  .env.example|.env.sample|.env.template)
    ;;
  .env|.env.*|package-lock.json)
    echo "BLOCKED: '$basename' は保護対象のため編集できません: $file_path" >&2
    exit 2
    ;;
esac

exit 0
