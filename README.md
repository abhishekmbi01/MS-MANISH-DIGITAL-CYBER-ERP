# MS MANISH CYBER ERP v3 - Partner Edition

This upgrade keeps the public customer work portal and adds a separate Partner/Cyber Login system.

## New in v3
- Partner/Cyber login with Partner ID + PIN
- Admin can create, disable/enable and reset PIN for partners
- Partner can submit customer work + documents
- Every partner sees only their own works
- Partner dashboard: total / processing / completed / payment recorded
- Partner name + Partner ID attached to every submitted work
- Expanded workflow statuses: New, Assigned, Processing, Checking, Waiting for Customer, Completed, Delivered
- Admin search by customer or partner
- CSV export includes partner details
- Existing customer portal, Work ID tracking and receipt remain available

## Run locally
1. Install Node.js 18+
2. Copy `.env.example` to `.env`
3. Change `ADMIN_PASSWORD` and `TOKEN_SECRET`
4. Run `npm install`
5. Run `npm start`

URLs:
- Customer: http://localhost:3000/
- Partner: http://localhost:3000/partner
- Admin: http://localhost:3000/admin

## Render deployment
Use the same Node service approach as the earlier portal. Build command: `npm install`; Start command: `npm start`.
For permanent uploaded documents and JSON data, attach a persistent disk or later move storage to MongoDB/S3/Cloudinary.
