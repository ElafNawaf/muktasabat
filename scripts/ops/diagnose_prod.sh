#!/bin/bash
docker exec muktasabat-api-1 python -c "
from api.email import _send_via_ses, EmailMessage
to='elaf.nawaf7@gmail.com'
try:
    _send_via_ses(EmailMessage(to=to, subject='Muktasabat — email test (lowercase)', text_body='Email delivery to this address works.')); print('RESULT lowercase OK')
except Exception as e:
    print('RESULT lowercase', str(getattr(e,'response',{}).get('Error',{}).get('Message','') or e)[:200])
"
