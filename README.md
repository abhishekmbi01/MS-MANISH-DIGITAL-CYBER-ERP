# MS MANISH DIGITAL CYBER EXPERT — ERP v4 Complete

Complete upgrade of the existing v3 Partner Edition. The public portal, Partner ID system and existing Work ID format remain supported while v4 adds finance, customer OTP, staff permissions, notifications, partner commission/wallet, cloud backup hooks and support/reminder tools.

## Included features

- WhatsApp Auto Update: work received, status change, completed, payment and ticket replies.
- SMS fallback through Twilio if WhatsApp send fails.
- Partner Commission: per-service default commission, earned/pending/settlement ledger.
- Partner Wallet: advance credit/debit + commission settlement.
- Customer Login / OTP: mobile OTP, all works, payments and support tickets.
- Payment System: Paid / Due / Partial, payment mode/reference/history.
- UPI QR: receipt QR becomes a UPI payment QR when UPI ID is configured and due exists.
- Receipt & Invoice: automatic receipt/invoice numbers for new work, printable / Save as PDF, WhatsApp share.
- Daily/Monthly Accounts: income, expense, profit, payments, expenses and combined cashbook with date range.
- Service Price List: editable default fee + partner commission.
- Document Checklist: editable service-wise required documents.
- Work Priority: Normal / Urgent / Very Urgent.
- Due Date + Deadline + Expiry Date.
- Partner Track Work: partner-only searchable work history and status.
- Staff Login: Admin and Operator roles, plus separate Partner login.
- Customer Database: customer-wise works, payments, documents and tickets.
- Search/Filters: date, service, partner, status, payment status, priority and keyword.
- Dashboard Charts: daily works/earnings and top services/partners.
- Automatic Backup: JSON + CSV snapshots, retention cleanup.
- Google Drive Backup: daily backup files + uploaded customer documents when service-account credentials are configured.
- Online Booking / Send Work: customer form with files, priority and payment proof.
- QR Code: receipt/status/UPI QR.
- Complaint / Support Ticket: customer creates, staff replies and resolves.
- Expiry Reminder: manual reminder list plus automatic 7-day scan.
- Partner ID Card: printable partner card with QR.

## Important: default service prices

v4 includes editable starter/default fee values so the Price List feature works immediately. Review and change these fees/partner commissions from **Admin → Services** before production use because your actual shop prices may differ.

## Fresh install

1. Install Node.js 18+ (20+ recommended).
2. Copy `.env.example` to `.env`.
3. Set strong `ADMIN_PASSWORD` and `TOKEN_SECRET`.
4. Run `npm install`.
5. Run `npm start`.
6. Open:
   - Public portal: `http://localhost:3000/`
   - Customer OTP: `http://localhost:3000/customer`
   - Partner: `http://localhost:3000/partner`
   - Admin/Staff: `http://localhost:3000/admin`

## Upgrade from current v3 WITHOUT losing data

**Do not replace/delete your current `data/` or `uploads/` before taking a backup.**

Recommended method:

1. Make a copy of the existing v3 project.
2. Extract this v4 folder separately.
3. Run:

```bash
node tools/migrate-v3.js /path/to/your/old-v3-project
```

4. The migration tool copies old requests/partners/expenses/services/settings and uploads, and also makes a `backups/pre-migration-*` copy.
5. Start v4. Old v3 works are normalized automatically. Old `services.json` string lists are automatically converted into v4 service objects.

If updating files manually on GitHub, replace application code but preserve live `data/` and uploaded files, then redeploy.

## Render persistence

The default `render.yaml` keeps deployment compatible with a normal Render web service. If your Render plan supports a persistent disk, use the included `render-persistent.yaml` and mount `/var/data`. Set:

- `DATA_DIR=/var/data/erp-data`
- `UPLOAD_DIR=/var/data/uploads`
- `BACKUP_DIR=/var/data/backups`

Without persistent storage, local JSON/uploads can be lost on ephemeral hosting restarts/redeploys.

## WhatsApp auto-send

Set:

- `WHATSAPP_ENABLED=true`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_API_VERSION`

The ERP uses Meta WhatsApp Cloud API. Meta policies may require an approved message template for proactive/business-initiated messages depending on the conversation window. The app also keeps a notification log and provides manual WhatsApp links in the UI.

## SMS fallback

Set:

- `SMS_ENABLED=true`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

SMS is attempted only when WhatsApp auto-send fails.

## Customer OTP

OTP is sent through the same WhatsApp/SMS notification system. For local testing only, set `OTP_DEV_MODE=true` so the API shows the OTP on screen. Keep it `false` in production.

## Google Drive backup

Create a Google Cloud service account, enable Google Drive API, share the destination Drive folder with the service-account email, then set:

- `GOOGLE_DRIVE_ENABLED=true`
- `GOOGLE_SERVICE_ACCOUNT_JSON={...service account JSON on one line...}`
- `GOOGLE_DRIVE_FOLDER_ID=...`

The ERP uploads automatic JSON/CSV backups and attempts to upload newly submitted documents.

## Security / production notes

- Change default admin password and token secret before deployment.
- Do not commit `.env` or service-account credentials.
- Use HTTPS in production.
- Keep a Render persistent disk or move data to a managed database/object storage later.
- Customer documents contain personal information; restrict admin/staff access and Drive folder access.

## Validation

Run:

```bash
npm run check
```

This performs JavaScript syntax checks for server and front-end scripts.
