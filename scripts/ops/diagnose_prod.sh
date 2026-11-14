#!/bin/bash
# Pass 9 — SES send test via the app's own email path (AWS mailbox simulator; no real inbox).
docker exec muktasabat-api-1 python -c "
from api.email import _send_via_ses, EmailMessage
for to in ['success@simulator.amazonses.com']:
    try:
        _send_via_ses(EmailMessage(to=to, subject='Muktasabat SES check', text_body='ok')); print('SES send to', to, ': OK')
    except Exception as e:
        print('SES send to', to, ':', type(e).__name__, str(getattr(e,'response',{}).get('Error',{}).get('Message','') or e)[:250])
"
