const form = document.querySelector("#admin-key-form");
const keyInput = document.querySelector("#admin-key");
const message = document.querySelector("#admin-message");
const section = document.querySelector("#orders-section");
const ordersContainer = document.querySelector("#admin-orders");
let adminKey = sessionStorage.getItem("kerietAdminKey") || "";

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency", currency: "KES", maximumFractionDigits: 0
  }).format(value);
}
function showMessage(text, type) {
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
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Request failed.");
  return result;
}
async function loadOrders() {
  try {
    const result = await adminApi("/api/admin/orders");
    section.hidden = false;
    message.hidden = true;
    renderOrders(result.orders);
  } catch (error) {
    section.hidden = true;
    showMessage(error.message, "error");
  }
}
function renderOrders(orders) {
  ordersContainer.innerHTML = "";
  if (!orders.length) {
    ordersContainer.innerHTML = "<p>No orders have been placed.</p>";
    return;
  }

  for (const order of orders) {
    const article = document.createElement("article");
    article.className = "admin-order-card";
    const items = order.items.map(item =>
      `<li>${item.quantity} × ${item.productName} — ${money(item.subtotal)}</li>`
    ).join("");

    article.innerHTML = `
      <div class="admin-order-heading">
        <div>
          <span class="status">${order.status}</span>
          <h3>Order #${order.id}</h3>
          <p>${new Date(order.createdAt).toLocaleString("en-KE")}</p>
        </div>
        <strong>${money(order.total)}</strong>
      </div>
      <div class="admin-customer">
        <p><strong>${order.customerName}</strong></p>
        <p>${order.phone}</p>
        <p>${order.email}</p>
        <p>${order.location}</p>
      </div>
      <ul>${items}</ul>
      <div class="payment-summary">
        <span>Payment: ${order.paymentMethod}</span>
        <span>Status: ${order.paymentStatus}</span>
        <span>M-Pesa code: ${order.mpesaCode || "Not supplied"}</span>
        <span>Points: ${order.pointsAwarded ? order.pointsEarned : "Not awarded"}</span>
      </div>
      <div class="admin-actions"></div>
    `;

    const actions = article.querySelector(".admin-actions");

    if (order.paymentStatus !== "paid") {
      const confirmButton = document.createElement("button");
      confirmButton.className = "button";
      confirmButton.type = "button";
      confirmButton.textContent = "Confirm payment and award points";
      confirmButton.onclick = async () => {
        if (!window.confirm("Confirm that payment has actually been received?")) return;
        try {
          await adminApi(`/api/admin/orders/${order.id}/confirm-payment`, { method: "PATCH" });
          await loadOrders();
        } catch (error) {
          showMessage(error.message, "error");
        }
      };
      actions.append(confirmButton);
    }

    if (order.status !== "completed") {
      const completeButton = document.createElement("button");
      completeButton.className = "button secondary";
      completeButton.type = "button";
      completeButton.textContent = "Mark completed";
      completeButton.onclick = async () => {
        try {
          await adminApi(`/api/admin/orders/${order.id}/complete`, { method: "PATCH" });
          await loadOrders();
        } catch (error) {
          showMessage(error.message, "error");
        }
      };
      actions.append(completeButton);
    }

    ordersContainer.append(article);
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  adminKey = keyInput.value;
  sessionStorage.setItem("kerietAdminKey", adminKey);
  await loadOrders();
});
document.querySelector("#refresh-orders").onclick = loadOrders;
if (adminKey) {
  keyInput.value = adminKey;
  loadOrders();
}