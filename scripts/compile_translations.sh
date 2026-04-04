#!/usr/bin/env sh
# Regenerate .mo files after editing app/translations/*/LC_MESSAGES/messages.po
cd "$(dirname "$0")/.." && pybabel compile -d app/translations
