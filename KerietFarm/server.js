const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.resolve(
  process.env.DATA_FILE || path.join(__dirname, "data", "store.json")
);

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

if (!fs.existsSync(DATA_FILE)) {
  throw new Error(`Data file not found: ${DATA_FILE}`);
}

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    }
  })
);

app.use(express.json({ limit: "40kb" }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.static(path.join(__dirname, "public")));

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  const temporaryFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryFile, DATA_FILE);
}

function cleanText(value, maximumLength) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maximumLength)
    : "";
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

function getPublicProduct(product, ratings) {
  const productRatings = ratings.filter(
    (rating) => rating.productId === product.id && rating.approved
  );

  const averageRating =
    productRatings.length === 0
      ? 0
      : Number(
          (
            productRatings.reduce((sum, item) => sum + item.rating, 0) /
            productRatings.length
          ).toFixed(1)
        );

  return {
    ...product,
    averageRating,
    ratingCount: productRatings.length
  };
}

app.get("/api/products", (request, response) => {
  const store = readStore();

  const products = store.products
    .filter((product) => product.active)
    .map((product) => getPublicProduct(product, store.ratings));

  response.json({ products });
});

app.get("/api/products/:productId/ratings", (request, response) => {
  const productId = Number(request.params.productId);

  if (!Number.isInteger(productId)) {
    return response.status(400).json({ message: "Invalid product." });
  }

  const store = readStore();

  const ratings = store.ratings
    .filter((rating) => rating.productId === productId && rating.approved)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map(({ phone, approved, ...publicRating }) => publicRating);

  response.json({ ratings });
});

app.post("/api/products/:productId/ratings", (request, response) => {
  const productId = Number(request.params.productId);
  const customerName = cleanText(request.body.customerName, 80);
  const phone = cleanText(request.body.phone, 20);
  const comment = cleanText(request.body.comment, 500);
  const rating = Number(request.body.rating);

  if (!Number.isInteger(productId)) {
    return response.status(400).json({ message: "Invalid product." });
  }

  if (customerName.length < 2) {
    return response.status(400).json({ message: "Enter your full name." });
  }

  if (!isValidKenyanPhone(phone)) {
    return response
      .status(400)
      .json({ message: "Enter a valid Kenyan phone number." });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return response
      .status(400)
      .json({ message: "Choose a rating between 1 and 5." });
  }

  const store = readStore();
  const product = store.products.find(
    (item) => item.id === productId && item.active
  );

  if (!product) {
    return response.status(404).json({ message: "Product not found." });
  }

  const newRating = {
    id: store.nextIds.rating++,
    productId,
    customerName,
    phone: normalizeKenyanPhone(phone),
    rating,
    comment,
    approved: true,
    createdAt: new Date().toISOString()
  };

  store.ratings.push(newRating);
  writeStore(store);

  response.status(201).json({
    message: "Thank you. Your review has been published.",
    rating: {
      id: newRating.id,
      productId,
      customerName,
      rating,
      comment,
      createdAt: newRating.createdAt
    }
  });
});

app.get("/api/feed", (request, response) => {
  const store = readStore();

  const posts = store.feedPosts
    .filter((post) => post.published)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);

  response.json({ posts });
});

app.get("/api/customers/points", (request, response) => {
  const phone = cleanText(request.query.phone, 20);

  if (!isValidKenyanPhone(phone)) {
    return response
      .status(400)
      .json({ message: "Enter a valid Kenyan phone number." });
  }

  const store = readStore();
  const normalizedPhone = normalizeKenyanPhone(phone);
  const customer = store.customers.find(
    (item) => item.phone === normalizedPhone
  );

  if (!customer) {
    return response.status(404).json({
      message: "No loyalty account exists for that phone number yet."
    });
  }

  response.json({
    customer: {
      name: customer.name,
      phone: customer.phone,
      loyaltyPoints: customer.loyaltyPoints,
      totalSpent: customer.totalSpent
    }
  });
});

app.post("/api/orders", (request, response) => {
  const customerName = cleanText(request.body.customerName, 80);
  const phone = cleanText(request.body.phone, 20);
  const location = cleanText(request.body.location, 150);
  const notes = cleanText(request.body.notes, 500);
  const items = request.body.items;

  if (customerName.length < 2) {
    return response.status(400).json({ message: "Enter your full name." });
  }

  if (!isValidKenyanPhone(phone)) {
    return response
      .status(400)
      .json({ message: "Enter a valid Kenyan phone number." });
  }

  if (location.length < 3) {
    return response.status(400).json({
      message: "Enter a delivery or pickup location."
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return response.status(400).json({ message: "Your cart is empty." });
  }

  if (items.length > 20) {
    return response.status(400).json({ message: "Too many cart items." });
  }

  const store = readStore();
  const normalizedItems = [];

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);

    if (
      !Number.isInteger(productId) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100
    ) {
      return response
        .status(400)
        .json({ message: "One or more cart items are invalid." });
    }

    const product = store.products.find(
      (candidate) => candidate.id === productId && candidate.active
    );

    if (!product) {
      return response.status(400).json({
        message: "One or more products are no longer available."
      });
    }

    normalizedItems.push({
      productId,
      productName: product.name,
      unitPrice: product.price,
      quantity,
      subtotal: product.price * quantity
    });
  }

  const total = normalizedItems.reduce(
    (sum, item) => sum + item.subtotal,
    0
  );

  const normalizedPhone = normalizeKenyanPhone(phone);

  let customer = store.customers.find(
    (item) => item.phone === normalizedPhone
  );

  if (!customer) {
    customer = {
      id: store.nextIds.customer++,
      name: customerName,
      phone: normalizedPhone,
      loyaltyPoints: 0,
      totalSpent: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    store.customers.push(customer);
  } else {
    customer.name = customerName;
    customer.updatedAt = new Date().toISOString();
  }

  const pointsEarned = Math.floor(total / 100);
  customer.loyaltyPoints += pointsEarned;
  customer.totalSpent += total;

  const order = {
    id: store.nextIds.order++,
    customerId: customer.id,
    customerName,
    phone: normalizedPhone,
    location,
    notes,
    items: normalizedItems,
    total,
    pointsEarned,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  store.orders.push(order);
  writeStore(store);

  response.status(201).json({
    message: "Your order has been received.",
    order: {
      id: order.id,
      total: order.total,
      status: order.status,
      pointsEarned,
      pointsBalance: customer.loyaltyPoints
    }
  });
});

app.get("/api/health", (request, response) => {
  response.json({
    status: "ok",
    service: "Keriet Farm API"
  });
});

app.get("/{*path}", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((error, request, response, next) => {
  console.error(error);
  response.status(500).json({
    message: "An unexpected server error occurred."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Keriet Farm is running at http://localhost:${PORT}`);
});