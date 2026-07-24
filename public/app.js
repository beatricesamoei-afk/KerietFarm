const $ = (selector) => document.querySelector(selector);
let products = [];
let currentCustomer = null;
let publicConfig = null;
let cart = loadCart();

const individualGrid = $("#individual-grid");
const basketGrid = $("#basket-grid");
const productMessage = $("#product-message");
const cartPanel = $("#cart-panel");
const notificationPanel = $("#notification-panel");
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
const accountDialog = $("#account-dialog");
const loggedOutView = $("#logged-out-view");
const loggedInView = $("#logged-in-view");
const loginForm = $("#login-form");
const signupForm = $("#signup-form");
const loginMessage = $("#login-message");
const signupMessage = $("#signup-message");
const accountDetails = $("#account-details");
const ratingDialog = $("#rating-dialog");
const ratingForm = $("#rating-form");
const ratingTitle = $("#rating-title");
const ratingProductId = $("#rating-product-id");
const ratingMessage = $("#rating-message");
const notificationList = $("#notification-list");
const notificationMessage = $("#notification-message");
const notificationCount = $("#notification-count");

function loadCart() {
  try { return JSON.parse(localStorage.getItem("kerietFarmCart")) || []; }
  catch { return []; }
}
function saveCart() {
  localStorage.setItem("kerietFarmCart", JSON.stringify(cart));
}
function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", maximumFractionDigits: 0
  }).format(value);
}
function showMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = false;
}
function hideMessage(element) {
  element.hidden = true;
  element.textContent = "";
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "The request failed.");
  return result;
}

async function loadInitialData() {
  try {
    const [productResult, configResult] = await Promise.all([
      api("/api/products"), api("/api/config")
    ]);
    products = productResult.products;
    publicConfig = configResult;
    renderProducts();
    renderCart();
    updateMpesaInstructions();
  } catch (error) {
    showMessage(productMessage, error.message, "error");
  }
  await refreshAccount(false);
}

function renderProducts() {
  individualGrid.innerHTML = "";
  basketGrid.innerHTML = "";
  for (const product of products) {
    if (product.category === "basket") {
      basketGrid.append(createBasketCard(product));
    } else {
      individualGrid.append(createProductCard(product));
    }
  }
}

function createRatingLine(product) {
  const line = document.createElement("div");
  line.className = "rating-line";
  const rounded = Math.round(product.averageRating || 0);
  line.innerHTML = `
    <span class="stars">${"★".repeat(rounded)}${"☆".repeat(5 - rounded)}</span>
    <span>${product.ratingCount ? `${product.averageRating} (${product.ratingCount})` : "No ratings yet"}</span>
  `;
  return line;
}

function createFooter(product) {
  const footer = document.createElement("div");
  footer.className = "product-footer";

  const price = document.createElement("div");
  price.className = "price";
  price.innerHTML = `<strong>${money(product.price)}</strong><small>per ${product.unit}</small>`;

  const actions = document.createElement("div");
  actions.className = "actions";

  const rate = document.createElement("button");
  rate.className = "rate-button";
  rate.type = "button";
  rate.textContent = "Rate";
  rate.onclick = () => {
    if (!currentCustomer) {
      openAccount();
      showMessage(loginMessage, "Log in before rating a product.", "error");
      return;
    }
    openRating(product);
  };

  const add = document.createElement("button");
  add.className = "add-button";
  add.type = "button";
  add.textContent = "Add";
  add.onclick = () => addToCart(product.id);

  actions.append(rate, add);
  footer.append(price, actions);
  return footer;
}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "product-card";

  const image = document.createElement("img");
  image.className = "product-image";
  image.src = product.image;
  image.alt = product.name;

  const content = document.createElement("div");
  content.className = "product-content";
  content.innerHTML = `
    <span class="badge">${product.badge}</span>
    <h3>${product.name}</h3>
    <p>${product.description}</p>
  `;
  content.append(createRatingLine(product), createFooter(product));
  article.append(image, content);
  return article;
}

function createBasketCard(product) {
  const article = document.createElement("article");
  article.className = product.poster
    ? "basket-card basket-poster-card"
    : "basket-card";

  const contents = (product.contents || [])
    .map(item => `<li>${item}</li>`)
    .join("");

  if (product.poster) {
    article.innerHTML = `
      <button class="poster-preview-button" type="button" aria-label="View ${product.name}">
        <img class="basket-poster-image" src="${product.image}" alt="${product.name} poster">
      </button>
      <div class="basket-poster-details">
        <div>
          <span class="badge">${product.badge}</span>
          <h3>${product.name}</h3>
          <p>${product.description}</p>
        </div>
        <ul>${contents}</ul>
      </div>
    `;

    article
      .querySelector(".poster-preview-button")
      .addEventListener("click", () => openPoster(product));

    const posterPrice = document.createElement("div");
    posterPrice.className = "basket-selling-price";
    posterPrice.innerHTML = `<span>Basket price</span><strong>${money(product.price)}</strong>`;

    article
      .querySelector(".basket-poster-details")
      .append(posterPrice, createFooter(product));

    return article;
  }

  article.innerHTML = `
    <div class="basket-visual">
      <img src="${product.image}" alt="">
      <span class="basket-badge">${product.badge}</span>
    </div>
    <div class="basket-content">
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <ul>${contents}</ul>
    </div>
  `;

  article
    .querySelector(".basket-content")
    .append(createFooter(product));

  return article;
}

function addToCart(productId) {
  const item = cart.find(candidate => candidate.productId === productId);
  if (item) item.quantity += 1;
  else cart.push({ productId, quantity: 1 });
  saveCart();
  renderCart();
  openPanel(cartPanel);
}

function detailedCart() {
  return cart.map(item => {
    const product = products.find(candidate => candidate.id === item.productId);
    return product ? { ...item, product, subtotal: product.price * item.quantity } : null;
  }).filter(Boolean);
}
function cartTotalValue() {
  return detailedCart().reduce((sum, item) => sum + item.subtotal, 0);
}
function changeQuantity(productId, change) {
  const item = cart.find(candidate => candidate.productId === productId);
  if (!item) return;
  item.quantity = Math.min(100, item.quantity + change);
  if (item.quantity <= 0) {
    cart = cart.filter(candidate => candidate.productId !== productId);
  }
  saveCart();
  renderCart();
}

function renderCart() {
  cartItems.innerHTML = "";
  for (const item of detailedCart()) {
    const article = document.createElement("article");
    article.className = "cart-item";
    article.innerHTML = `
      <img src="${item.product.image}" alt="">
      <div>
        <h3>${item.product.name}</h3>
        <p>${money(item.product.price)} × ${item.quantity}</p>
        <button class="remove-button" type="button">Remove</button>
      </div>
      <div class="quantity">
        <button type="button">−</button>
        <span>${item.quantity}</span>
        <button type="button">+</button>
      </div>
    `;
    const buttons = article.querySelectorAll("button");
    buttons[0].onclick = () => {
      cart = cart.filter(candidate => candidate.productId !== item.productId);
      saveCart();
      renderCart();
    };
    buttons[1].onclick = () => changeQuantity(item.productId, -1);
    buttons[2].onclick = () => changeQuantity(item.productId, 1);
    cartItems.append(article);
  }

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = count;
  cartTotal.textContent = money(cartTotalValue());
  checkoutTotal.textContent = money(cartTotalValue());
  cartEmpty.hidden = count > 0;
  cartSummary.hidden = count === 0;
}

function openPanel(panel) {
  closePanels();
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
}
function closePanels() {
  [cartPanel, notificationPanel].forEach(panel => {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
  });
  overlay.hidden = true;
}

function openAccount() {
  updateAccountView();
  accountDialog.showModal();
}
function showLogin() {
  loginForm.hidden = false;
  signupForm.hidden = true;
  $("#show-login").classList.add("active");
  $("#show-signup").classList.remove("active");
}
function showSignup() {
  loginForm.hidden = true;
  signupForm.hidden = false;
  $("#show-signup").classList.add("active");
  $("#show-login").classList.remove("active");
}

async function refreshAccount(showErrors = true) {
  try {
    currentCustomer = (await api("/api/auth/me")).customer;
    updateAccountView();
    await loadNotifications();
  } catch (error) {
    currentCustomer = null;
    updateAccountView();
    notificationCount.textContent = "0";
    if (showErrors && error.message !== "Log in to continue.") console.error(error);
  }
}

function updateAccountView() {
  if (currentCustomer) {
    loggedOutView.hidden = true;
    loggedInView.hidden = false;
    $("#account-button").textContent = currentCustomer.name.split(" ")[0];
    accountDetails.innerHTML = `
      <div><span>Name</span><strong>${currentCustomer.name}</strong></div>
      <div><span>Email</span><strong>${currentCustomer.email}</strong></div>
      <div><span>Phone</span><strong>${currentCustomer.phone}</strong></div>
      <div><span>Points</span><strong>${currentCustomer.loyaltyPoints}</strong></div>
      <div><span>Confirmed spending</span><strong>${money(currentCustomer.totalSpent)}</strong></div>
    `;
  } else {
    loggedOutView.hidden = false;
    loggedInView.hidden = true;
    $("#account-button").textContent = "Account";
  }
}

async function loadNotifications() {
  if (!currentCustomer) return;
  try {
    const notifications = (await api("/api/notifications")).notifications;
    notificationList.innerHTML = "";
    notificationCount.textContent = notifications.filter(item => !item.read).length;

    if (!notifications.length) {
      notificationList.innerHTML = '<div class="empty-state"><span>🔔</span><p>No notifications yet.</p></div>';
      return;
    }

    for (const notification of notifications) {
      const article = document.createElement("article");
      article.className = `notification-card ${notification.read ? "" : "unread"}`;
      article.innerHTML = `
        <strong>${notification.title}</strong>
        <p>${notification.message}</p>
        <time>${new Date(notification.createdAt).toLocaleString("en-KE")}</time>
      `;
      if (!notification.read) {
        article.onclick = async () => {
          await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
          await loadNotifications();
        };
      }
      notificationList.append(article);
    }
  } catch (error) {
    showMessage(notificationMessage, error.message, "error");
  }
}

function openRating(product) {
  hideMessage(ratingMessage);
  ratingForm.reset();
  ratingProductId.value = product.id;
  ratingTitle.textContent = `Rate ${product.name}`;
  ratingDialog.showModal();
}


function openPoster(product) {
  const dialog = document.querySelector("#poster-dialog");
  const image = document.querySelector("#poster-dialog-image");
  const title = document.querySelector("#poster-dialog-title");
  const price = document.querySelector("#poster-dialog-price");
  const addButton = document.querySelector("#poster-dialog-add");

  image.src = product.image;
  image.alt = product.name;
  title.textContent = product.name;
  price.textContent = money(product.price);

  addButton.onclick = () => {
    addToCart(product.id);
    dialog.close();
  };

  dialog.showModal();
}

function updateMpesaInstructions() {
  if (!publicConfig) return;
  const target = $("#mpesa-instructions");
  if (publicConfig.mpesa.configured) {
    target.textContent = `Send the order total to ${publicConfig.mpesa.paymentNumber} (${publicConfig.mpesa.paymentName}), then enter the transaction code below.`;
  } else {
    target.textContent = `The M-Pesa receiving number has not been selected yet. Place the order and contact ${publicConfig.businessPhones.join(" or ")} for payment instructions.`;
  }
}

$("#cart-button").onclick = () => openPanel(cartPanel);
$("#close-cart").onclick = closePanels;
$("#close-notifications").onclick = closePanels;
overlay.onclick = closePanels;

$("#notification-button").onclick = async () => {
  if (!currentCustomer) {
    openAccount();
    showMessage(loginMessage, "Log in to view notifications.", "error");
    return;
  }
  await loadNotifications();
  openPanel(notificationPanel);
};

$("#account-button").onclick = openAccount;
$("#account-cta").onclick = openAccount;
$("#close-account").onclick = () => accountDialog.close();
$("#show-login").onclick = showLogin;
$("#show-signup").onclick = showSignup;

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(loginMessage);
  const form = new FormData(loginForm);
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
    });
    currentCustomer = result.customer;
    updateAccountView();
    await loadNotifications();
    loginForm.reset();
  } catch (error) {
    showMessage(loginMessage, error.message, "error");
  }
});

signupForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(signupMessage);
  const form = new FormData(signupForm);
  try {
    const result = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"), email: form.get("email"), phone: form.get("phone"),
        address: form.get("address"), password: form.get("password")
      })
    });
    currentCustomer = result.customer;
    updateAccountView();
    await loadNotifications();
    signupForm.reset();
  } catch (error) {
    showMessage(signupMessage, error.message, "error");
  }
});

$("#logout-button").onclick = async () => {
  await api("/api/auth/logout", { method: "POST" });
  currentCustomer = null;
  updateAccountView();
  notificationCount.textContent = "0";
};
$("#refresh-account").onclick = () => refreshAccount(true);

$("#checkout-button").onclick = () => {
  closePanels();
  if (!currentCustomer) {
    openAccount();
    showMessage(loginMessage, "Create an account or log in before placing an order.", "error");
    return;
  }
  hideMessage(checkoutMessage);
  checkoutTotal.textContent = money(cartTotalValue());
  $("#checkout-account-summary").innerHTML = `
    <strong>${currentCustomer.name}</strong>
    <span>${currentCustomer.email}</span>
    <span>${currentCustomer.phone}</span>
  `;
  checkoutForm.elements.location.value = currentCustomer.address || "";
  checkoutDialog.showModal();
};

$("#close-checkout").onclick = () => checkoutDialog.close();
$("#payment-method").onchange = () => {
  $("#mpesa-box").hidden = $("#payment-method").value !== "mpesa";
};

checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(checkoutMessage);
  const form = new FormData(checkoutForm);
  submitOrderButton.disabled = true;
  submitOrderButton.textContent = "Sending order…";
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        location: form.get("location"),
        paymentMethod: form.get("paymentMethod"),
        mpesaCode: form.get("mpesaCode"),
        notes: form.get("notes"),
        items: cart.map(item => ({ productId: item.productId, quantity: item.quantity }))
      })
    });

    showMessage(
      checkoutMessage,
      `Order #${result.order.id} received. Total: ${money(result.order.total)}. Points will be added after payment is confirmed.`,
      "success"
    );
    cart = [];
    saveCart();
    renderCart();
    checkoutForm.reset();
    $("#mpesa-box").hidden = true;
    await loadNotifications();
  } catch (error) {
    showMessage(checkoutMessage, error.message, "error");
  } finally {
    submitOrderButton.disabled = false;
    submitOrderButton.textContent = "Place order";
  }
});

$("#close-poster").onclick = () => $("#poster-dialog").close();
$("#close-rating").onclick = () => ratingDialog.close();
ratingForm.addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage(ratingMessage);
  const form = new FormData(ratingForm);
  try {
    const result = await api(`/api/products/${Number(ratingProductId.value)}/ratings`, {
      method: "POST",
      body: JSON.stringify({
        rating: Number(form.get("rating")),
        comment: form.get("comment")
      })
    });
    showMessage(ratingMessage, result.message, "success");
    products = (await api("/api/products")).products;
    renderProducts();
  } catch (error) {
    showMessage(ratingMessage, error.message, "error");
  }
});

loadInitialData();