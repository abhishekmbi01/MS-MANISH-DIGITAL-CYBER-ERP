# MS MANISH DIGITAL CYBER ERP v4 — ONLINE CUSTOMER EDITION

This build keeps the existing customer portal + admin ERP, and adds production-ready support for:

- Public customer access from any phone/network after deployment
- MongoDB Atlas for permanent requests, status, services, settings, expenses and ERP data
- Cloudinary for permanent JPG/PNG/WEBP/PDF document and payment-proof storage
- Local JSON/local upload fallback for testing on your own PC
- Health endpoint for hosting: `/api/health`
- Customer portal: `/`
- Status section: `/#track`
- Admin ERP: `/admin`

## Local test

```cmd
npm install
copy .env.example .env
npm start
```

Open `http://localhost:3000`.

If MongoDB/Cloudinary variables are blank, local testing uses JSON files + `uploads/`.

## Public online deployment

For customer use from anywhere, configure BOTH MongoDB Atlas and Cloudinary environment variables on your Node hosting provider.

Required production variables:

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `MONGODB_URI`
- `MONGODB_DB`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

A `render.yaml` is included for Render Blueprint deployment. You can also deploy the same Node project to Railway/VPS or another Node host.

## Important

Do not put real database/cloud-storage passwords in GitHub files. Add them only as hosting Environment Variables. Change the default admin password before publishing.
