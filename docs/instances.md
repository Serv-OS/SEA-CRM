# Live instances

| Instance | Repo | Supabase ref | Region | Vercel | Notes |
|---|---|---|---|---|---|
| Posupject (dev/test) | Serv-OS/posupject | yuevuqvldtmjwwzjrddo | us-west-2 | posupject.vercel.app | Original build/test instance |
| POSUP CRM (production) | Serv-OS/posupcrm | xvtzxlyjasdmwxqchwmm | eu-west-2 (London) | TBC | Cloned 10 Jun 2026; blank data; schema replayed from posupject |

## POSUP CRM — remaining setup checklist
- [ ] Vercel project from Serv-OS/posupcrm (env: VITE_SUPABASE_URL=https://xvtzxlyjasdmwxqchwmm.supabase.co, VITE_SUPABASE_ANON_KEY from dashboard, VITE_GOOGLE_CLIENT_ID from new Google project)
- [ ] Supabase Auth: Email OTP length = 6; magic-link email template; Site URL = Vercel URL
- [ ] Google Cloud project (consent Internal, scopes gmail.modify/send + calendar.events + chat.*, Chat app config, OAuth client w/ redirect to xvtzxlyjasdmwxqchwmm gmail-oauth-callback)
- [ ] Edge function secrets: GMAIL_CLIENT_ID/SECRET, APP_URL, TWILIO_* (when number bought)
- [ ] First owner login → profiles.role = 'owner'
- [ ] In-app: Branding, AI key, Stripe key, quote/invoice terms

DB passwords: generated at creation, stored temporarily in /tmp on Peter's Mac
(posupcrm_dbpass.txt) — move to a password manager.
