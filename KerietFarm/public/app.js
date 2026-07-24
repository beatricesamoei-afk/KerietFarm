const $ = (selector) => document.querySelector(selector);

const productGrid = $("#product-grid");
const productMessage = $("#product-message");
const cartPanel = $("#cart-panel");
const overlay = $("#overlay");
const cartItems = $("#cart-items");
const cartEmpty = $("#cart-empty");
const cartSummary = $("#cart-summary");
const cartCount = $("#cart-count");
const cartTotal = $("#cart-total");
const checkoutDialog = $("#checkout-dialog");
const checkoutForm = $("#checkout-form");
const checkoutTotal = $("#checkout-total");
const checkoutMessage = $("#checkout-message");
const submitOrderButton = $("#submit-order");
const ratingDialog = $("#rating-dialog");
const ratingForm = $("#rating-form");
const ratingTitle = $("#rating-title");
const ratingProductId = $("#rating-product-id");
const ratingMessage = $("#rating-message");
const pointsForm = $("#points-form");
const pointsMessage = $("#points-message");

let products = [];
let cart = loadCart();

$("#year").textContent = new Date().getFullYear();

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem("kerietFarmCart")) || [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem("kerietFarmCart", JSON.stringify(cart));
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(value);
}

function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = false;
}

function hideMessage(element) {
  element.textContent = "";
  element.hidden = true;
}

async function fetchProducts() {
  hideMessage(productMessage);

  try {
    const response = await fetch("/api/products");

    if (!response.ok) {
      throw new Error("Products could not be loaded.");
    }

    products = (await response.json()).products;
    cart = cart.filter((item) =>
      products.some((product) => product.id === item.productId)
    );

    saveCart();
    renderProducts();
    renderCart();
  } catch (error) {
    productGrid.innerHTML = "";
    showMessage(productMessage, error.message, "error");
  }
}

function renderProducts() {
  productGrid.innerHTML = "";

  for (const product of products) {
    const article = document.createElement("article");
    article.className = "product-card";

    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";

    const content = document.createElement("div");
    content.className = "product-content";

    const name = document.createElement("h3");
    name.textContent = product.name;

    const description = document.createElement("p");
    description.className = "description";
    description.textContent = product.description;

    const ratingLine = document.createElement("div");
    ratingLine.className = "rating-line";

    const rounded = Math.round(product.averageRating || 0);
    const stars = document.createElement("span");
    stars.className = "stars";
    stars.textContent = "★".repeat(rounded) + "☆".repeat(5 - rounded);

    const ratingText = document.createElement("span");
    ratingText.textContent = product.ratingCount
      ? `${product.averageRating} (${product.ratingCount})`
      : "No ratings yet";

    ratingLine.append(stars, ratingText);

    const footer = document.createElement("div");
    footer.className = "product-footer";

    const price = document.createElement("div");
    price.className = "price";
    price.innerHTML = `<strong>${money(product.price)}</strong><small>per ${product.unit}</small>`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const rateButton = document.createElement("button");
    rateButton.className = "rate";
    rateButton.type = "button";
    rateButton.textContent = "Rate";
    rateButton.addEventListener("click", () => openRating(product));

    const addButton = document.createElement("button");
    addButton.className = "add";
    addButton.type = "button";
    addButton.textContent = "Add";
    addButton.addEventListener("click", () => addToCart(product.id));

    actions.append(rateButton, addButton);
    footer.append(price, actions);
    content.append(name, description, ratingLine, footer);
    article.append(image, content);
    productGrid.append(article);
  }
}

function addToCart(productId) {
  const item = cart.find((candidate) => candidate.productId === productId);

  if (item) {
    item.quantity += 1;
  } else {
    cart.push({ productId, quantity: 1 });
  }

  saveCart();
  renderCart();
  openCart();
}

function changeQuantity(productId, difference) {
  const item = cart.find((candidate) => candidate.productId === productId);

  if (!item) return;

  item.quantity = Math.min(100, item.quantity + difference);

  if (item.quantity <= 0) {
    cart = cart.filter((candidate) => candidate.productId !== productId);
  }

  saveCart();
  renderCart();
}

function detailedCart() {
  return cart
    .map((item) => {
      const product = products.find(
        (candidate) => candidate.id === item.productId
      );

      if (!product) return null;

      return {
        ...item,
        product,
        subtotal: product.price * item.quantity
      };
    })
    .filter(Boolean);
}

function total() {
  return detailedCart().reduce((sum, item) => sum + item.subtotal, 0);
}

function renderCart() {
  cartItems.innerHTML = "";

  for (const item of detailedCart()) {
    const row = document.createElement("article");
    row.className = "cart-item";

    const image = document.createElement("img");
    image.src = item.product.image;
    image.alt = "";

    const details = document.createElement("div");
    details.innerHTML = `
      <h3>${item.product.name}</h3>
      <p>${money(item.product.price)} × ${item.quantity}</p>
    `;

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      cart = cart.filter(
        (candidate) => candidate.productId !== item.productId
      );
      saveCart();
      renderCart();
    });

    details.append(remove);

    const quantity = document.createElement("div");
    quantity.className = "quantity";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.addEventListener("click", () =>
      changeQuantity(item.productId, -1)
    );

    const count = document.createElement("span");
    count.textContent = item.quantity;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.addEventListener("click", () =>
      changeQuantity(item.productId, 1)
    );

    quantity.append(minus, count, plus);
    row.append(image, details, quantity);
    cartItems.append(row);
  }

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  cartCount.textContent = count;
  cartTotal.textContent = money(total());
  checkoutTotal.textContent = money(total());
  cartEmpty.hidden = count > 0;
  cartSummary.hidden = count === 0;
}

function openCart() {
  cartPanel.classList.add("open");
  cartPanel.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
}

function closeCart() {
  cartPanel.classList.remove("open");
  cartPanel.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
}

function openRating(product) {
  hideMessage(ratingMessage);
  ratingForm.reset();
  ratingProductId.value = product.id;
  ratingTitle.textContent = `Rate ${product.name}`;
  ratingDialog.showModal();
}

$("#cart-button").addEventListener("click", openCart);
$("#close-cart").addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);

$("#checkout-button").addEventListener("click", () => {
  closeCart();
  hideMessage(checkoutMessage);
  checkoutTotal.textContent = money(total());
  checkoutDialog.showModal();
});

$("#close-checkout").addEventListener("click", () => checkoutDialog.close());
$("#close-rating").addEventListener("click", () => ratingDialog.close());

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(checkoutMessage);

  const form = new FormData(checkoutForm);

  const payload = {
    customerName: form.get("customerName"),
    phone: form.get("phone"),
    location: form.get("location"),
    notes: form.get("notes"),
    items: cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    }))
  };

  submitOrderButton.disabled = true;
  submitOrderButton.textContent = "Sending…";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    showMessage(
      checkoutMessage,
      `Order #${result.order.id} received. Total: ${money(
        result.order.total
      )}. You earned ${result.order.pointsEarned} point(s) and now have ${
        result.order.pointsBalance
      } point(s).`,
      "success"
    );

    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
  } catch (error) {
    showMessage(checkoutMessage, error.message || "Order failed.", "error");
  } finally {
    submitOrderButton.disabled = false;
    submitOrderButton.textContent = "Place order";
  }
});

ratingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(ratingMessage);

  const form = new FormData(ratingForm);
  const productId = Number(ratingProductId.value);

  const payload = {
    customerName: form.get("customerName"),
    phone: form.get("phone"),
    rating: Number(form.get("rating")),
    comment: form.get("comment")
  };

  try {
    const response = await fetch(`/api/products/${productId}/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    showMessage(ratingMessage, result.message, "success");
    await fetchProducts();
  } catch (error) {
    showMessage(ratingMessage, error.message || "Rating failed.", "error");
  }
});

pointsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage(pointsMessage);

  const phone = new FormData(pointsForm).get("phone");

  try {
    const response = await fetch(
      `/api/customers/points?phone=${encodeURIComponent(phone)}`
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message);
    }

    showMessage(
      pointsMessage,
      `${result.customer.name}, you have ${
        result.customer.loyaltyPoints
      } point(s). Total spending: ${money(result.customer.totalSpent)}.`,
      "success"
    );
  } catch (error) {
    showMessage(pointsMessage, error.message || "Could not check points.", "error");
  }
});

fetchProducts();
renderCart();