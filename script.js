// Google Apps Script Deploy URL ကို ဒီနေရာတွင် အစားထိုးပါ
const API_URL = "https://script.google.com/macros/s/AKfycbzN3HA3MPbQw0JenqqDpQY8xAOaSMpc_FxkGonqIdLQOKJLdYdhcw_ZmdlEAFU2ifuW/exec"; 

let currentUser = null;
let products = [];
let cart = [];

// API Call Wrapper
async function apiCall(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return await response.json();
  } catch (err) {
    console.error("API Error: ", err);
    return { success: false, message: "Network Error" };
  }
}

// 1. Auth Login Handlers
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await apiCall('login', {
    username: document.getElementById('username').value,
    password: document.getElementById('password').value
  });

  if (res.success) {
    currentUser = res.user;
    document.getElementById('loginScreen').classList.add('d-none');
    document.getElementById('appContainer').classList.remove('d-none');
    document.getElementById('userBadge').innerText = `${currentUser.username} (${currentUser.role})`;
    
    setupRoleViews();
  } else {
    const errDiv = document.getElementById('loginError');
    errDiv.innerText = res.message;
    errDiv.classList.remove('d-none');
  }
});

function logout() {
  location.reload();
}

// 2. Role Interface Routing
function setupRoleViews() {
  document.querySelectorAll('.role-section').forEach(el => el.classList.add('d-none'));

  if (currentUser.role === 'Staff') {
    document.getElementById('staffSection').classList.remove('d-none');
    loadProducts();
  } else if (currentUser.role === 'Admin') {
    document.getElementById('adminSection').classList.remove('d-none');
    document.getElementById('staffSection').classList.remove('d-none');
    loadProducts();
  } else if (currentUser.role === 'Owner') {
    document.getElementById('staffSection').classList.remove('d-none');
    document.getElementById('adminSection').classList.remove('d-none');
    document.getElementById('ownerSection').classList.remove('d-none');
    loadProducts();
    loadStats();
  }
}

// 3. POS Engine & Cart Processing
async function loadProducts() {
  const res = await apiCall('getProducts');
  if (res.success) {
    products = res.products;
    renderProducts(products);
  }
}

function renderProducts(items) {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = items.map(p => `
    <div class="col">
      <div class="card product-card p-2 text-center h-100" onclick="addToCart('${p.barcode}')">
        <div class="fw-bold text-dark">${p.name}</div>
        <div class="small text-muted">${p.price} MMK</div>
        <div class="badge bg-info mt-1">Stock: ${p.stock}</div>
      </div>
    </div>
  `).join('');
}

function addToCart(barcode) {
  const prod = products.find(p => p.barcode == barcode);
  if (!prod || prod.stock <= 0) return alert("Out of stock!");

  const existing = cart.find(item => item.barcode == barcode);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ barcode: prod.barcode, name: prod.name, price: prod.price, qty: 1 });
  }
  calculateCart();
}

function calculateCart() {
  const tbody = document.getElementById('cartTable');
  tbody.innerHTML = cart.map((item, index) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.qty}</td>
      <td>${item.price * item.qty}</td>
      <td><button class="btn btn-sm btn-danger py-0" onclick="removeItem(${index})">&times;</button></td>
    </tr>
  `).join('');

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = Number(document.getElementById('discountInput').value) || 0;
  const grandTotal = subtotal - discount;

  document.getElementById('subTotal').innerText = subtotal + " MMK";
  document.getElementById('grandTotal').innerText = (grandTotal > 0 ? grandTotal : 0) + " MMK";
}

function removeItem(index) {
  cart.splice(index, 1);
  calculateCart();
}

async function processCheckout() {
  if (cart.length === 0) return alert("Cart is empty!");

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = Number(document.getElementById('discountInput').value) || 0;
  const grandTotal = subtotal - discount;

  const payload = {
    items: cart,
    subtotal: subtotal,
    discount: discount,
    total: grandTotal,
    paymentMethod: document.getElementById('payMethod').value,
    cashier: currentUser.username
  };

  const res = await apiCall('checkout', payload);
  if (res.success) {
    triggerThermalPrint(res.voucherId, payload);
    cart = [];
    calculateCart();
    loadProducts();
  }
}

function triggerThermalPrint(voucherId, data) {
  document.getElementById('rVoucher').innerText = voucherId;
  document.getElementById('rDate').innerText = new Date().toLocaleString();
  document.getElementById('rCashier').innerText = data.cashier;
  document.getElementById('rTotal').innerText = data.total + " MMK";
  
  document.getElementById('rItems').innerHTML = data.items.map(i => `
    <div class="d-flex justify-content-between">
      <span>${i.name} x${i.qty}</span>
      <span>${i.price * i.qty}</span>
    </div>
  `).join('');

  document.getElementById('printArea').classList.remove('d-none');
  window.print();
  document.getElementById('printArea').classList.add('d-none');
}

// 4. Admin & Owner Dashboard Logic
document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    barcode: document.getElementById('pBarcode').value,
    name: document.getElementById('pName').value,
    category: document.getElementById('pCategory').value,
    cost: Number(document.getElementById('pCost').value),
    price: Number(document.getElementById('pPrice').value),
    stock: Number(document.getElementById('pStock').value)
  };
  const res = await apiCall('addProduct', payload);
  if (res.success) {
    alert("Product added successfully!");
    e.target.reset();
    loadProducts();
  }
});

async function loadStats() {
  const res = await apiCall('getStats');
  if (res.success) {
    document.getElementById('statSales').innerText = res.stats.totalSales + " MMK";
    document.getElementById('statExp').innerText = res.stats.totalExpenses + " MMK";
    document.getElementById('statProfit').innerText = res.stats.netProfit + " MMK";
  }
}