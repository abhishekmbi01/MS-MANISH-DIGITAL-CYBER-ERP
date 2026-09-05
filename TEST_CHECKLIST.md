# Production Test Checklist

After `npm install` and before going live:

- [ ] `npm run check` passes.
- [ ] `/api/health` returns `ok: true`.
- [ ] Admin login works with environment credentials.
- [ ] Create one Operator login and confirm work/account access.
- [ ] Create one Partner and confirm Partner ID + PIN login.
- [ ] Partner submits a customer work and only sees its own work.
- [ ] Public customer submits work and gets Work ID.
- [ ] Service selection shows fee and document checklist.
- [ ] Admin changes status; customer tracking updates.
- [ ] Add payment; Paid/Due/Partial totals update correctly.
- [ ] Receipt opens, QR renders and Print / Save PDF works.
- [ ] If UPI ID is configured, receipt QR opens UPI payment flow.
- [ ] Customer OTP login works using configured WhatsApp/SMS provider.
- [ ] Customer sees all works/payments for the same mobile number.
- [ ] Customer creates ticket; Admin replies; customer sees reply.
- [ ] Partner commission becomes earned on Completed/Delivered status.
- [ ] Partner wallet credit/debit/commission settlement updates correctly.
- [ ] Accounts Today and This Month filters work.
- [ ] CSV export downloads.
- [ ] Full JSON backup downloads and manual backup run succeeds.
- [ ] If Google Drive configured, backup appears in configured folder.
- [ ] Create a work with Expiry Date; reminder appears in Admin.
- [ ] Test on mobile screen before announcing the upgrade.
