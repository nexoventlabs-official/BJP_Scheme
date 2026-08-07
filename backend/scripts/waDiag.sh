#!/bin/bash
cd /var/www/bjptn/backend || exit 1
TOKEN=$(grep '^META_ACCESS_TOKEN=' .env | cut -d= -f2-)
WABA=$(grep '^META_WABA_ID=' .env | cut -d= -f2-)
PNID=$(grep '^META_PHONE_NUMBER_ID=' .env | cut -d= -f2-)
APP=$(grep '^META_APP_ID=' .env | cut -d= -f2-)
SECRET=$(grep '^META_APP_SECRET=' .env | cut -d= -f2-)
V=$(grep '^META_GRAPH_VERSION=' .env | cut -d= -f2-); V=${V:-v22.0}

echo "=== Phone number status ==="
curl -s "https://graph.facebook.com/$V/$PNID?fields=verified_name,display_phone_number,name_status,code_verification_status,quality_rating,status&access_token=$TOKEN"
echo; echo
echo "=== WABA subscribed_apps ==="
curl -s "https://graph.facebook.com/$V/$WABA/subscribed_apps?access_token=$TOKEN"
echo; echo
echo "=== App webhook subscription ==="
curl -s "https://graph.facebook.com/$V/$APP/subscriptions?access_token=${APP}|${SECRET}"
echo
