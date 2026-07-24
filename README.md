# Keriet Farm Full Update

Features:
- Customer signup and login
- Password hashing
- Secure login cookie
- Real product photos
- Individual products and farm baskets
- Shopping cart
- Customer notifications
- Email order notifications when SMTP is configured
- Manual M-Pesa/cash selection
- Administrator order dashboard
- Points awarded only after administrator confirms payment

## Local setup
1. Copy `.env.example` to `.env`.
2. Replace `JWT_SECRET` and `ADMIN_KEY` with long random values.
3. Run `npm install`.
4. Run `npm run dev`.
5. Shop: `http://localhost:3000`
6. Admin: `http://localhost:3000/admin.html`

`MPESA_PAYMENT_NUMBER` is intentionally blank. Add the correct Till, Paybill or receiving number only after Keriet Farm decides which destination should receive customer payments.

- Basket promotional posters with full-screen preview and Add to Cart

- Professional dark-green and cream e-commerce styling
- Farm to Table slogan and leaf branding
- Basket posters show only the basket selling price
- Harvest Basket removed

## Render authentication and administrator fix

This version includes:

- Automatic migration of older `/var/data/store.json` files
- Missing `notifications` and `nextIds` fields are created automatically
- Old customer records without password hashes no longer crash login
- Administrator dashboard available at `/admin` and `/admin.html`
- Separate login and signup cards
- Visible administrator link in the navigation and footer
- Professional announcement bar, trust section and WhatsApp button

### Required Render environment variables

Set these inside Render > your service > Environment:

```env
NODE_ENV=production
DATA_FILE=/var/data/store.json
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_KEY=replace-with-your-private-admin-key
BUSINESS_PHONE_1=0790388133
BUSINESS_PHONE_2=0707588544
MPESA_PAYMENT_NUMBER=0707588544
MPESA_PAYMENT_NAME=Keriet Farm
ADMIN_EMAIL=your-real-email@example.com
```

After deployment, open:

- Shop: `/`
- Administrator dashboard: `/admin`

The administrator key is the exact value stored in `ADMIN_KEY`.
