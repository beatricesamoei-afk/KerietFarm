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
