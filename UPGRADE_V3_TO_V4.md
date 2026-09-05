# Safe V3 → V4 Upgrade

1. Export/download the current ERP backup first.
2. Copy the complete current `data/` folder and `uploads/` folder to a separate safe location.
3. Deploy v4 code.
4. Preserve/copy these v3 files into v4 when they exist:
   - `data/requests.json`
   - `data/partners.json`
   - `data/expenses.json`
   - `data/services.json`
   - `data/settings.json`
   - `uploads/`
5. Do not copy old `server.js`, `public/admin.js`, or other old application code over v4.
6. Start v4 once. The server auto-normalizes old work/payment fields and converts old string-only services to structured services.
7. Admin login → Services: verify fees and commissions.
8. Admin login → Backup: run a fresh v4 backup.
9. Test one customer booking, one partner booking, payment, status change, receipt and customer OTP before announcing the update.

For Render, persistent disk storage is strongly recommended. Use `render-persistent.yaml` when your Render plan supports a disk; it mounts `/var/data` and directs ERP data/uploads/backups there.
