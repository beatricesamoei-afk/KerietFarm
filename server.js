const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.resolve(process.env.DATA_FILE || path.join(__dirname, "data", "store.json"));
const SEED_DATA_FILE = path.join(__dirname, "data", "store.json");
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-this-secret";
const ADMIN_KEY = process.env.ADMIN_KEY || "development-only-change-this-admin-key";
const BUSINESS_PHONE_1 = process.env.BUSINESS_PHONE_1 || "0790388133";
const BUSINESS_PHONE_2 = process.env.BUSINESS_PHONE_2 || "0707588544";
const MPESA_PAYMENT_NUMBER = process.env.MPESA_PAYMENT_NUMBER || "";
const MPESA_PAYMENT_NAME = process.env.MPESA_PAYMENT_NAME || "Keriet Farm";

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  if (!fs.existsSync(SEED_DATA_FILE)) {
    throw new Error(`Seed data file not found: ${SEED_DATA_FILE}`);
  }
  fs.copyFileSync(SEED_DATA_FILE, DATA_FILE);
  console.log(`Created initial data file at ${DATA_FILE}`);
}

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"], connectSrc: ["'self'"], fontSrc: ["'self'"],
      objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
}));
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 220,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use("/api/admin", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false
}));
app.use(express.static(path.join(__dirname, "public")));

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryFile, DATA_FILE);
}

function highestId(items) {
  return Array.isArray(items)
    ? items.reduce((highest, item) => {
        const id = Number(item && item.id);
        return Number.isFinite(id) ? Math.max(highest, id) : highest;
      }, 0)
    : 0;
}

function migrateStore() {
  const store = readStore();

  store.products = Array.isArray(store.products) ? store.products : [];
  store.customers = Array.isArray(store.customers) ? store.customers : [];
  store.orders = Array.isArray(store.orders) ? store.orders : [];
  store.ratings = Array.isArray(store.ratings) ? store.ratings : [];
  store.notifications = Array.isArray(store.notifications)
    ? store.notifications
    : [];
  store.feedPosts = Array.isArray(store.feedPosts) ? store.feedPosts : [];
  store.coupons = Array.isArray(store.coupons) ? store.coupons : [];
  store.settings = store.settings && typeof store.settings === "object"
    ? store.settings
    : {
        loyaltyPointsPerKsh: 0.01,
        standardDeliveryFee: 0,
        freeDeliveryThreshold: 0
      };

  for (const customer of store.customers) {
    customer.loyaltyPoints = Number(customer.loyaltyPoints) || 0;
    customer.totalSpent = Number(customer.totalSpent) || 0;
    customer.address = typeof customer.address === "string"
      ? customer.address
      : "";
  }

  for (const order of store.orders) {
    order.pointsAwarded = Boolean(order.pointsAwarded);
    order.pointsEarned = Number(order.pointsEarned) || 0;
    order.paymentStatus = order.paymentStatus || "unpaid";
    order.status = order.status || "pending";
  }

  store.nextIds = {
    customer: Math.max(
      Number(store.nextIds && store.nextIds.customer) || 1,
      highestId(store.customers) + 1
    ),
    order: Math.max(
      Number(store.nextIds && store.nextIds.order) || 1,
      highestId(store.orders) + 1
    ),
    rating: Math.max(
      Number(store.nextIds && store.nextIds.rating) || 1,
      highestId(store.ratings) + 1
    ),
    notification: Math.max(
      Number(store.nextIds && store.nextIds.notification) || 1,
      highestId(store.notifications) + 1
    ),
    feedPost: Math.max(
      Number(store.nextIds && store.nextIds.feedPost) || 1,
      highestId(store.feedPosts) + 1
    )
  };

  writeStore(store);
  console.log("Keriet Farm data store migrated successfully.");
}

function synchronizeProductCatalogue() {
  migrateStore();

  if (DATA_FILE === SEED_DATA_FILE) return;

  const seedStore = JSON.parse(fs.readFileSync(SEED_DATA_FILE, "utf8"));
  const liveStore = readStore();

  liveStore.products = seedStore.products;
  liveStore.feedPosts = seedStore.feedPosts;

  writeStore(liveStore);
  console.log("Keriet Farm catalogue synchronized.");
}

synchronizeProductCatalogue();

function cleanText(value, maximumLength) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximumLength) : "";
}
function normalizeEmail(email) {
  return cleanText(email, 180).toLowerCase();
}
function normalizeKenyanPhone(phone) {
  const cleaned = String(phone || "").replace(/[\s()-]/g, "");
  if (cleaned.startsWith("+254")) return cleaned;
  if (cleaned.startsWith("254")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+254${cleaned.slice(1)}`;
  return cleaned;
}
function isValidKenyanPhone(phone) {
  return /^\+254(?:7|1)\d{8}$/.test(normalizeKenyanPhone(phone));
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
function publicCustomer(customer) {
  return {
    id: customer.id, name: customer.name, email: customer.email,
    phone: customer.phone, address: customer.address,
    loyaltyPoints: customer.loyaltyPoints, totalSpent: customer.totalSpent
  };
}
function createToken(customer) {
  return jwt.sign({ customerId: customer.id, email: customer.email }, JWT_SECRET, { expiresIn: "7d" });
}
function setAuthCookie(response, token) {
  response.cookie("keriet_auth", token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}
function requireAuth(request, response, next) {
  const token = request.cookies.keriet_auth;
  if (!token) return response.status(401).json({ message: "Log in to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const store = readStore();
    const customer = store.customers.find(item => item.id === payload.customerId);
    if (!customer) return response.status(401).json({ message: "Your account could not be found." });
    request.customer = customer;
    next();
  } catch {
    response.clearCookie("keriet_auth");
    return response.status(401).json({ message: "Your login session has expired." });
  }
}
function requireAdmin(request, response, next) {
  const suppliedKey = request.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== ADMIN_KEY) {
    return response.status(401).json({ message: "Invalid administrator key." });
  }
  next();
}
function addNotification(store, customerId, title, message, type) {
  const notification = {
    id: store.nextIds.notification++, customerId, title, message, type,
    read: false, createdAt: new Date().toISOString()
  };
  store.notifications.push(notification);
  return notification;
}

const mailTransporter = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

async function sendEmail({ to, subject, text }) {
  if (!mailTransporter || !to) {
    console.log(`Email skipped: ${subject}`);
    return;
  }
  await mailTransporter.sendMail({
    from: process.env.EMAIL_FROM || "Keriet Farm <no-reply@kerietfarm.com>",
    to, subject, text
  });
}

function getPublicProduct(product, ratings) {
  const productRatings = ratings.filter(rating => rating.productId === product.id && rating.approved);
  const averageRating = productRatings.length === 0
    ? 0
    : Number((productRatings.reduce((sum, item) => sum + item.rating, 0) / productRatings.length).toFixed(1));
  return { ...product, averageRating, ratingCount: productRatings.length };
}


function safeCustomerForAdmin(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address || "",
    loyaltyPoints: Number(customer.loyaltyPoints) || 0,
    totalSpent: Number(customer.totalSpent) || 0,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

app.get("/api/config", (request, response) => {
  response.json({
    businessPhones: [BUSINESS_PHONE_1, BUSINESS_PHONE_2],
    mpesa: {
      configured: Boolean(MPESA_PAYMENT_NUMBER),
      paymentNumber: MPESA_PAYMENT_NUMBER,
      paymentName: MPESA_PAYMENT_NAME
    }
  });
});

app.post("/api/auth/signup", async (request, response) => {
  const name = cleanText(request.body.name, 80);
  const email = normalizeEmail(request.body.email);
  const phone = cleanText(request.body.phone, 20);
  const address = cleanText(request.body.address, 180);
  const password = typeof request.body.password === "string" ? request.body.password : "";

  if (name.length < 2) return response.status(400).json({ message: "Enter your full name." });
  if (!isValidEmail(email)) return response.status(400).json({ message: "Enter a valid email address." });
  if (!isValidKenyanPhone(phone)) return response.status(400).json({ message: "Enter a valid Kenyan phone number." });
  if (password.length < 8) return response.status(400).json({ message: "Your password must contain at least 8 characters." });

  const store = readStore();
  if (store.customers.some(customer => customer.email === email || customer.phone === normalizeKenyanPhone(phone))) {
    return response.status(409).json({ message: "An account already exists with that email or phone number." });
  }

  const customer = {
    id: store.nextIds.customer++, name, email, phone: normalizeKenyanPhone(phone), address,
    passwordHash: await bcrypt.hash(password, 12), loyaltyPoints: 0, totalSpent: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };

  store.customers.push(customer);
  addNotification(store, customer.id, "Welcome to Keriet Farm", "Your Keriet Farm account has been created successfully.", "account");
  writeStore(store);

  setAuthCookie(response, createToken(customer));
  sendEmail({
    to: customer.email,
    subject: "Welcome to Keriet Farm",
    text: `Hello ${customer.name},\n\nYour Keriet Farm account has been created.\nContact us on ${BUSINESS_PHONE_1} or ${BUSINESS_PHONE_2}.`
  }).catch(console.error);

  response.status(201).json({ message: "Your account has been created.", customer: publicCustomer(customer) });
});

app.post("/api/auth/login", async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const password = typeof request.body.password === "string" ? request.body.password : "";
  const store = readStore();
  const customer = store.customers.find(item => item.email === email);

  if (
    !customer ||
    typeof customer.passwordHash !== "string" ||
    !(await bcrypt.compare(password, customer.passwordHash))
  ) {
    return response.status(401).json({
      message: "Incorrect email or password."
    });
  }

  setAuthCookie(response, createToken(customer));
  response.json({ message: "You are logged in.", customer: publicCustomer(customer) });
});

app.post("/api/auth/logout", (request, response) => {
  response.clearCookie("keriet_auth");
  response.json({ message: "You are logged out." });
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({ customer: publicCustomer(request.customer) });
});

app.get("/api/notifications", requireAuth, (request, response) => {
  const store = readStore();
  const notifications = store.notifications
    .filter(notification => notification.customerId === request.customer.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  response.json({ notifications });
});

app.patch("/api/notifications/:notificationId/read", requireAuth, (request, response) => {
  const notificationId = Number(request.params.notificationId);
  const store = readStore();
  const notification = store.notifications.find(
    item => item.id === notificationId && item.customerId === request.customer.id
  );
  if (!notification) return response.status(404).json({ message: "Notification not found." });
  notification.read = true;
  writeStore(store);
  response.json({ message: "Notification marked as read." });
});

app.get("/api/products", (request, response) => {
  const store = readStore();
  response.json({
    products: store.products
      .filter(product => product.active)
      .map(product => getPublicProduct(product, store.ratings))
  });
});

app.post("/api/products/:productId/ratings", requireAuth, (request, response) => {
  const productId = Number(request.params.productId);
  const comment = cleanText(request.body.comment, 500);
  const rating = Number(request.body.rating);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return response.status(400).json({ message: "Choose a rating between 1 and 5." });
  }

  const store = readStore();
  const product = store.products.find(item => item.id === productId && item.active);
  if (!product) return response.status(404).json({ message: "Product not found." });

  const existing = store.ratings.find(
    item => item.productId === productId && item.customerId === request.customer.id
  );

  if (existing) {
    existing.rating = rating;
    existing.comment = comment;
    existing.updatedAt = new Date().toISOString();
  } else {
    store.ratings.push({
      id: store.nextIds.rating++, productId, customerId: request.customer.id,
      customerName: request.customer.name, rating, comment, approved: true,
      createdAt: new Date().toISOString()
    });
  }

  writeStore(store);
  response.status(201).json({ message: "Thank you. Your review has been saved." });
});

app.get("/api/feed", (request, response) => {
  const store = readStore();
  response.json({
    posts: store.feedPosts
      .filter(post => post.published)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

app.post("/api/orders", requireAuth, (request, response) => {
  const location = cleanText(request.body.location, 180);
  const notes = cleanText(request.body.notes, 500);
  const paymentMethod = cleanText(request.body.paymentMethod, 20);
  const mpesaCode = cleanText(request.body.mpesaCode, 20);
  const items = request.body.items;

  if (location.length < 3) return response.status(400).json({ message: "Enter a delivery or pickup location." });
  if (!["mpesa", "cash"].includes(paymentMethod)) {
    return response.status(400).json({ message: "Choose M-Pesa or cash as the payment method." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return response.status(400).json({ message: "Your cart is empty." });
  }

  const store = readStore();
  const normalizedItems = [];

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return response.status(400).json({ message: "One or more cart items are invalid." });
    }
    const product = store.products.find(candidate => candidate.id === productId && candidate.active);
    if (!product) return response.status(400).json({ message: "One or more products are unavailable." });
    if (Number.isInteger(product.stock) && product.stock < quantity) {
      return response.status(409).json({
        message: `${product.name} only has ${product.stock} item(s) remaining.`
      });
    }
    normalizedItems.push({
      productId, productName: product.name, unitPrice: product.price,
      quantity, subtotal: product.price * quantity
    });
  }

  const total = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const customer = store.customers.find(item => item.id === request.customer.id);

  const order = {
    id: store.nextIds.order++, customerId: customer.id, customerName: customer.name,
    email: customer.email, phone: customer.phone, location, notes, items: normalizedItems,
    total, paymentMethod, mpesaCode: mpesaCode || null,
    paymentStatus: paymentMethod === "mpesa" ? "awaiting_verification" : "unpaid",
    status: "pending", pointsAwarded: false, pointsEarned: 0,
    createdAt: new Date().toISOString()
  };

  store.orders.push(order);
  for (const item of normalizedItems) {
    const product = store.products.find(candidate => candidate.id === item.productId);
    if (product && Number.isInteger(product.stock)) {
      product.stock = Math.max(0, product.stock - item.quantity);
    }
  }
  addNotification(
    store, customer.id, `Order #${order.id} received`,
    `We received your order worth KSh ${order.total}. We will notify you after payment is confirmed.`,
    "order"
  );
  writeStore(store);

  const itemLines = order.items.map(item => `${item.quantity} × ${item.productName} — KSh ${item.subtotal}`).join("\n");

  sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `New Keriet Farm order #${order.id}`,
    text:
      `New Keriet Farm order\n\nCustomer: ${order.customerName}\nPhone: ${order.phone}\nEmail: ${order.email}\n` +
      `Location: ${order.location}\nPayment: ${order.paymentMethod}\nM-Pesa code: ${order.mpesaCode || "Not supplied"}\n\n` +
      `${itemLines}\n\nTotal: KSh ${order.total}`
  }).catch(console.error);

  sendEmail({
    to: customer.email,
    subject: `Keriet Farm order #${order.id} received`,
    text:
      `Hello ${customer.name},\n\nWe received order #${order.id} worth KSh ${order.total}.\n` +
      `Your points will be added only after payment is confirmed.\n\nContact: ${BUSINESS_PHONE_1} or ${BUSINESS_PHONE_2}.`
  }).catch(console.error);

  response.status(201).json({
    message: "Your order has been received.",
    order: { id: order.id, total: order.total, paymentStatus: order.paymentStatus, status: order.status, pointsEarned: 0 }
  });
});

app.get("/api/orders/my", requireAuth, (request, response) => {
  const store = readStore();
  response.json({
    orders: store.orders
      .filter(order => order.customerId === request.customer.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  });
});

app.get("/api/admin/orders", requireAdmin, (request, response) => {
  const store = readStore();
  response.json({ orders: [...store.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

app.patch("/api/admin/orders/:orderId/confirm-payment", requireAdmin, (request, response) => {
  const orderId = Number(request.params.orderId);
  const store = readStore();
  const order = store.orders.find(item => item.id === orderId);
  if (!order) return response.status(404).json({ message: "Order not found." });

  const customer = store.customers.find(item => item.id === order.customerId);
  order.paymentStatus = "paid";
  order.status = "confirmed";
  order.paymentConfirmedAt = new Date().toISOString();

  if (!order.pointsAwarded) {
    const points = Math.floor(order.total / 100);
    customer.loyaltyPoints += points;
    customer.totalSpent += order.total;
    customer.updatedAt = new Date().toISOString();
    order.pointsAwarded = true;
    order.pointsEarned = points;
    addNotification(
      store, customer.id, `Payment confirmed for order #${order.id}`,
      `Your payment was confirmed. You earned ${points} point(s) and now have ${customer.loyaltyPoints} point(s).`,
      "payment"
    );
  }

  writeStore(store);

  sendEmail({
    to: customer.email,
    subject: `Payment confirmed for Keriet Farm order #${order.id}`,
    text:
      `Hello ${customer.name},\n\nPayment for order #${order.id} has been confirmed.\n` +
      `You earned ${order.pointsEarned} point(s).\nYour balance is ${customer.loyaltyPoints} point(s).`
  }).catch(console.error);

  response.json({ message: "Payment confirmed and points awarded.", order, customer: publicCustomer(customer) });
});

app.patch("/api/admin/orders/:orderId/complete", requireAdmin, (request, response) => {
  const orderId = Number(request.params.orderId);
  const store = readStore();
  const order = store.orders.find(item => item.id === orderId);
  if (!order) return response.status(404).json({ message: "Order not found." });

  order.status = "completed";
  order.completedAt = new Date().toISOString();
  addNotification(store, order.customerId, `Order #${order.id} completed`, "Your Keriet Farm order has been marked as completed.", "order");
  writeStore(store);
  response.json({ message: "Order marked as completed.", order });
});


app.get("/api/admin/summary", requireAdmin, (request, response) => {
  const store = readStore();
  const paidOrders = store.orders.filter(order => order.paymentStatus === "paid");
  const awaitingPayments = store.orders.filter(
    order => order.paymentStatus === "awaiting_verification"
  );
  const activeProducts = store.products.filter(product => product.active);

  response.json({
    summary: {
      customers: store.customers.length,
      orders: store.orders.length,
      awaitingPayments: awaitingPayments.length,
      paidRevenue: paidOrders.reduce(
        (total, order) => total + Number(order.total || 0),
        0
      ),
      activeProducts: activeProducts.length,
      reviews: store.ratings.length
    }
  });
});

app.get("/api/admin/customers", requireAdmin, (request, response) => {
  const store = readStore();
  response.json({
    customers: [...store.customers]
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .map(safeCustomerForAdmin)
  });
});

app.delete("/api/admin/customers/:customerId", requireAdmin, (request, response) => {
  const customerId = Number(request.params.customerId);
  const store = readStore();
  const customer = store.customers.find(item => item.id === customerId);

  if (!customer) {
    return response.status(404).json({ message: "Customer not found." });
  }

  const customerOrders = store.orders.filter(order => order.customerId === customerId);
  const hasPaidOrder = customerOrders.some(order => order.paymentStatus === "paid");

  if (hasPaidOrder) {
    return response.status(409).json({
      message:
        "This customer has paid orders. Keep the account for financial records."
    });
  }

  store.customers = store.customers.filter(item => item.id !== customerId);
  store.orders = store.orders.filter(order => order.customerId !== customerId);
  store.notifications = store.notifications.filter(
    notification => notification.customerId !== customerId
  );
  store.ratings = store.ratings.filter(rating => rating.customerId !== customerId);
  writeStore(store);

  response.json({
    message: `Test customer ${customer.phone} was deleted successfully.`
  });
});

app.patch("/api/admin/customers/:customerId/reset-password", requireAdmin, async (request, response) => {
  const customerId = Number(request.params.customerId);
  const password = typeof request.body.password === "string"
    ? request.body.password
    : "";

  if (password.length < 8) {
    return response.status(400).json({
      message: "The temporary password must contain at least 8 characters."
    });
  }

  const store = readStore();
  const customer = store.customers.find(item => item.id === customerId);

  if (!customer) {
    return response.status(404).json({ message: "Customer not found." });
  }

  customer.passwordHash = await bcrypt.hash(password, 12);
  customer.updatedAt = new Date().toISOString();
  addNotification(
    store,
    customer.id,
    "Your password was reset",
    "An administrator reset your password. Log in using the temporary password and contact Keriet Farm if you did not request this.",
    "account"
  );
  writeStore(store);

  response.json({ message: "Customer password reset successfully." });
});

app.patch("/api/admin/orders/:orderId/status", requireAdmin, (request, response) => {
  const allowedStatuses = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "completed",
    "cancelled"
  ];
  const status = cleanText(request.body.status, 40);

  if (!allowedStatuses.includes(status)) {
    return response.status(400).json({ message: "Invalid order status." });
  }

  const orderId = Number(request.params.orderId);
  const store = readStore();
  const order = store.orders.find(item => item.id === orderId);

  if (!order) {
    return response.status(404).json({ message: "Order not found." });
  }

  order.status = status;
  order.updatedAt = new Date().toISOString();

  addNotification(
    store,
    order.customerId,
    `Order #${order.id} updated`,
    `Your order status is now: ${status.replaceAll("_", " ")}.`,
    "order"
  );
  writeStore(store);

  response.json({ message: "Order status updated.", order });
});

app.get("/api/admin/products", requireAdmin, (request, response) => {
  const store = readStore();
  response.json({ products: store.products });
});

app.patch("/api/admin/products/:productId", requireAdmin, (request, response) => {
  const productId = Number(request.params.productId);
  const store = readStore();
  const product = store.products.find(item => item.id === productId);

  if (!product) {
    return response.status(404).json({ message: "Product not found." });
  }

  if (request.body.name !== undefined) {
    const name = cleanText(request.body.name, 100);
    if (name.length < 2) {
      return response.status(400).json({ message: "Enter a valid product name." });
    }
    product.name = name;
  }

  if (request.body.price !== undefined) {
    const price = Number(request.body.price);
    if (!Number.isFinite(price) || price < 0) {
      return response.status(400).json({ message: "Enter a valid product price." });
    }
    product.price = Math.round(price);
  }

  if (request.body.active !== undefined) {
    product.active = Boolean(request.body.active);
  }

  if (request.body.stock !== undefined) {
    const stock = Number(request.body.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      return response.status(400).json({ message: "Stock must be zero or more." });
    }
    product.stock = stock;
  }

  product.updatedAt = new Date().toISOString();
  writeStore(store);
  response.json({ message: "Product updated.", product });
});

app.get("/api/admin/reviews", requireAdmin, (request, response) => {
  const store = readStore();
  const reviews = store.ratings.map(rating => {
    const customer = store.customers.find(item => item.id === rating.customerId);
    const product = store.products.find(item => item.id === rating.productId);
    return {
      ...rating,
      customerName: customer ? customer.name : "Deleted customer",
      productName: product ? product.name : "Deleted product"
    };
  });
  response.json({ reviews });
});

app.delete("/api/admin/reviews/:reviewId", requireAdmin, (request, response) => {
  const reviewId = Number(request.params.reviewId);
  const store = readStore();
  const before = store.ratings.length;
  store.ratings = store.ratings.filter(item => item.id !== reviewId);

  if (store.ratings.length === before) {
    return response.status(404).json({ message: "Review not found." });
  }

  writeStore(store);
  response.json({ message: "Review deleted." });
});

app.get("/api/admin/export/orders.csv", requireAdmin, (request, response) => {
  const store = readStore();
  const rows = [
    [
      "Order ID",
      "Date",
      "Customer",
      "Phone",
      "Email",
      "Location",
      "Total KSh",
      "Payment",
      "M-Pesa Code",
      "Payment Status",
      "Order Status"
    ]
  ];

  for (const order of store.orders) {
    rows.push([
      order.id,
      order.createdAt,
      order.customerName,
      order.phone,
      order.email,
      order.location,
      order.total,
      order.paymentMethod,
      order.mpesaCode || "",
      order.paymentStatus,
      order.status
    ]);
  }

  const csv = rows.map(row => row.map(csvCell).join(",")).join("\n");
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="keriet-orders-${new Date().toISOString().slice(0, 10)}.csv"`
  );
  response.send(csv);
});

app.get("/api/health", (request, response) => {
  response.json({ status: "ok", service: "Keriet Farm API" });
});

app.get("/admin", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin/", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/{*path}", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, request, response, next) => {
  const errorId = `KF-${Date.now().toString(36).toUpperCase()}`;
  console.error(`[${errorId}]`, error);
  response.status(500).json({
    message: "An unexpected server error occurred.",
    errorId
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Keriet Farm is running on port ${PORT}`);
});