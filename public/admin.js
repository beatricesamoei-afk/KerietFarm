const form = document.querySelector("#admin-key-form");
const keyInput = document.querySelector("#admin-key");
const message = document.querySelector("#admin-message");
const loginCard = document.querySelector("#admin-login-card");
const dashboard = document.querySelector("#admin-dashboard");
const summaryCards = document.querySelector("#summary-cards");
const ordersContainer = document.querySelector("#admin-orders");
const customersContainer = document.querySelector("#admin-customers");
const productsContainer = document.querySelector("#admin-products");
const reviewsContainer = document.querySelector("#admin-reviews");
const customerSearch = document.querySelector("#customer-search");

let adminKey = sessionStorage.getItem("kerietAdminKey") || "";
let customers = [];

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message ${type}`;
  message.hidden = false;
}

async function adminApi(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(result.message || result || "Request failed.");
  }
  return result;
}

function statusLabel(value) {
  return escapeHtml(String(value || "unknown").replaceAll("_", " "));
}

async function loadSummary() {
  const { summary } = await adminApi("/api/admin/summary");
  const cards = [
    ["Customers", summary.customers],
    ["Orders", summary.orders],
    ["Awaiting payment", summary.awaitingPayments],
    ["Paid revenue", money(summary.paidRevenue)],
    ["Active products", summary.activeProducts],
    ["Reviews", summary.reviews]
  ];

  summaryCards.innerHTML = cards.map(([label, value]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

async function loadOrders() {
  const { orders } = await adminApi("/api/admin/orders");
  ordersContainer.innerHTML = "";

  if (!orders.length) {
    ordersContainer.innerHTML = '<div class="empty-state"><p>No orders have been placed.</p></div>';
    return;
  }

  for (const order of orders) {
    const article = document.createElement("article");
    article.className = "admin-order-card";
    const items = order.items.map(item =>
      `<li>${item.quantity} × ${escapeHtml(item.productName)} — ${money(item.subtotal)}</li>`
    ).join("");

    article.innerHTML = `
      <div class="admin-order-heading">
        <div>
          <span class="status">${statusLabel(order.status)}</span>
          <h3>Order #${order.id}</h3>
          <p>${new Date(order.createdAt).toLocaleString("en-KE")}</p>
        </div>
        <strong>${money(order.total)}</strong>
      </div>
      <div class="admin-customer">
        <p><strong>${escapeHtml(order.customerName)}</strong></p>
        <p>${escapeHtml(order.phone)}</p>
        <p>${escapeHtml(order.email)}</p>
        <p>${escapeHtml(order.location)}</p>
      </div>
      <ul>${items}</ul>
      <div class="payment-summary">
        <span>Payment: ${statusLabel(order.paymentMethod)}</span>
        <span>Status: ${statusLabel(order.paymentStatus)}</span>
        <span>M-Pesa code: ${escapeHtml(order.mpesaCode || "Not supplied")}</span>
        <span>Points: ${order.pointsAwarded ? order.pointsEarned : "Not awarded"}</span>
      </div>
      <div class="admin-actions"></div>
    `;

    const actions = article.querySelector(".admin-actions");

    if (order.paymentStatus !== "paid") {
      const confirmButton = document.createElement("button");
      confirmButton.className = "button";
      confirmButton.type = "button";
      confirmButton.textContent = "Confirm payment";
      confirmButton.onclick = async () => {
        if (!confirm("Confirm that the payment is visible on the receiving M-Pesa account?")) return;
        await adminApi(`/api/admin/orders/${order.id}/confirm-payment`, { method: "PATCH" });
        await refreshAll();
      };
      actions.append(confirmButton);
    }

    const select = document.createElement("select");
    select.className = "admin-status-select";
    const statuses = [
      "pending", "confirmed", "preparing", "ready",
      "out_for_delivery", "completed", "cancelled"
    ];
    select.innerHTML = statuses.map(status =>
      `<option value="${status}" ${status === order.status ? "selected" : ""}>${status.replaceAll("_", " ")}</option>`
    ).join("");
    select.onchange = async () => {
      await adminApi(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });
      await refreshAll();
    };
    actions.append(select);

    ordersContainer.append(article);
  }
}

async function loadCustomers() {
  const result = await adminApi("/api/admin/customers");
  customers = result.customers;
  renderCustomers();
}

function renderCustomers() {
  const query = customerSearch.value.trim().toLowerCase();
  const filtered = customers.filter(customer =>
    [customer.name, customer.email, customer.phone]
      .some(value => String(value || "").toLowerCase().includes(query))
  );

  customersContainer.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Customer</th><th>Contact</th><th>Points</th><th>Spent</th><th>Joined</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${filtered.map(customer => `
          <tr>
            <td><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(customer.address || "")}</small></td>
            <td>${escapeHtml(customer.email)}<small>${escapeHtml(customer.phone)}</small></td>
            <td>${customer.loyaltyPoints}</td>
            <td>${money(customer.totalSpent)}</td>
            <td>${customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("en-KE") : "—"}</td>
            <td>
              <div class="table-actions">
                <button class="small-button reset-password" data-id="${customer.id}" type="button">Reset password</button>
                <button class="small-button danger delete-customer" data-id="${customer.id}" type="button">Delete test account</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  customersContainer.querySelectorAll(".delete-customer").forEach(button => {
    button.onclick = async () => {
      const customer = customers.find(item => item.id === Number(button.dataset.id));
      if (!confirm(`Delete the test account for ${customer.phone}? Unpaid orders will also be removed.`)) return;
      await adminApi(`/api/admin/customers/${customer.id}`, { method: "DELETE" });
      await refreshAll();
    };
  });

  customersContainer.querySelectorAll(".reset-password").forEach(button => {
    button.onclick = async () => {
      const password = prompt("Enter a temporary password with at least 8 characters:");
      if (!password) return;
      await adminApi(`/api/admin/customers/${button.dataset.id}/reset-password`, {
        method: "PATCH",
        body: JSON.stringify({ password })
      });
      alert("Password reset successfully.");
    };
  });
}

async function loadProducts() {
  const { products } = await adminApi("/api/admin/products");
  productsContainer.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Active</th><th>Save</th>
      </tr></thead>
      <tbody>
        ${products.map(product => `
          <tr data-product-id="${product.id}">
            <td><input class="product-name-input" value="${escapeHtml(product.name)}"></td>
            <td>${escapeHtml(product.category)}</td>
            <td><input class="product-price-input compact-input" type="number" min="0" value="${product.price}"></td>
            <td><input class="product-stock-input compact-input" type="number" min="0" value="${Number.isInteger(product.stock) ? product.stock : 100}"></td>
            <td><input class="product-active-input" type="checkbox" ${product.active ? "checked" : ""}></td>
            <td><button class="small-button save-product" type="button">Save</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  productsContainer.querySelectorAll(".save-product").forEach(button => {
    button.onclick = async () => {
      const row = button.closest("tr");
      await adminApi(`/api/admin/products/${row.dataset.productId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: row.querySelector(".product-name-input").value,
          price: Number(row.querySelector(".product-price-input").value),
          stock: Number(row.querySelector(".product-stock-input").value),
          active: row.querySelector(".product-active-input").checked
        })
      });
      button.textContent = "Saved";
      setTimeout(() => { button.textContent = "Save"; }, 1200);
      await loadSummary();
    };
  });
}

async function loadReviews() {
  const { reviews } = await adminApi("/api/admin/reviews");
  reviewsContainer.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>Product</th><th>Customer</th><th>Rating</th><th>Comment</th><th>Action</th></tr></thead>
      <tbody>
        ${reviews.map(review => `
          <tr>
            <td>${escapeHtml(review.productName)}</td>
            <td>${escapeHtml(review.customerName)}</td>
            <td>${"★".repeat(Number(review.rating) || 0)}</td>
            <td>${escapeHtml(review.comment || "No comment")}</td>
            <td><button class="small-button danger delete-review" data-id="${review.id}" type="button">Delete</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  reviewsContainer.querySelectorAll(".delete-review").forEach(button => {
    button.onclick = async () => {
      if (!confirm("Delete this review?")) return;
      await adminApi(`/api/admin/reviews/${button.dataset.id}`, { method: "DELETE" });
      await refreshAll();
    };
  });
}

async function refreshAll() {
  try {
    await Promise.all([
      loadSummary(),
      loadOrders(),
      loadCustomers(),
      loadProducts(),
      loadReviews()
    ]);
    message.hidden = true;
  } catch (error) {
    showMessage(error.message);
  }
}

function openDashboard() {
  loginCard.hidden = true;
  dashboard.hidden = false;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  adminKey = keyInput.value.trim();
  sessionStorage.setItem("kerietAdminKey", adminKey);

  try {
    await loadSummary();
    openDashboard();
    await refreshAll();
  } catch (error) {
    sessionStorage.removeItem("kerietAdminKey");
    showMessage(error.message);
  }
});

document.querySelectorAll(".admin-tabs button").forEach(button => {
  button.onclick = () => {
    document.querySelectorAll(".admin-tabs button").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".admin-tab-panel").forEach(panel => { panel.hidden = true; });
    button.classList.add("active");
    document.querySelector(`#tab-${button.dataset.tab}`).hidden = false;
  };
});

document.querySelectorAll(".refresh-admin").forEach(button => {
  button.onclick = refreshAll;
});

customerSearch.addEventListener("input", renderCustomers);

document.querySelector("#export-orders").onclick = async () => {
  const response = await fetch("/api/admin/export/orders.csv", {
    headers: { "x-admin-key": adminKey }
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || "Export failed.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `keriet-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

document.querySelector("#admin-logout").onclick = () => {
  sessionStorage.removeItem("kerietAdminKey");
  location.reload();
};

if (adminKey) {
  keyInput.value = adminKey;
  loadSummary()
    .then(async () => {
      openDashboard();
      await refreshAll();
    })
    .catch(() => {
      sessionStorage.removeItem("kerietAdminKey");
    });
}
