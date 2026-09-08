// Google Apps Script Deploy URL ကို အောက်တွင် ထည့်သွင်းပါ
const API_URL = "https://script.google.com/macros/s/AKfycbzN3HA3MPbQw0JenqqDpQY8xAOaSMpc_FxkGonqIdLQOKJLdYdhcw_ZmdlEAFU2ifuW/exec"; 

let currentUser = null;
let products = [];
let cart = [];
let heldCart = null;

// Generic Fetch Wrapper
async function apiCall(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return await response.json();
  } catch (err) {
    console.error("API Fetch Error:", err);
    return { success: false, message: "Network error. Please check internet or Script URL." };
  }
}

// 1. Authentication Logic
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const loginBtn = document.getElementById('loginBtn');
  const btnText = document.getElementById('loginBtnText');
  const spinner = document.getElementById('loginSpinner');
  const errDiv = document.getElementById('loginError');

  errDiv.classList.add('d-none');
  loginBtn.disabled = true;
  btnText.innerText = "Authenticating...";
  spinner.classList.remove('d-none');

  const payload = {
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value.trim()
  };

  const res = await apiCall('login', payload);

  loginBtn.disabled = false;
  btnText.innerText = "Sign In";
  spinner.classList.add('d-none');

  if (res.success) {
    currentUser = res.user;
    document.getElementById('loginScreen').classList.add('d-none');
    document.getElementById('appContainer').classList.remove('d-none');
    document.getElementById('userBadge').innerText = `${currentUser.username} (${currentUser.role})`;
    
    setupRoleViews();
  } else {
    errDiv.innerText = res.message || "Invalid Username or Password";
    errDiv.classList.remove('d-none');
  }
});

function logout() {
  location.reload();
}

// 2. Role Interface Controller
function setupRoleViews() {
  document.querySelectorAll('.role-section').forEach(el => el.classList.add('d-none'));

  const role = currentUser.role;
  if (role === 'Staff') {
    document.getElementById('staffSection').classList.remove('d-none');
    loadProducts();
  } else if (role === 'Admin') {
    document.getElementById('staffSection').classList.remove('d-none');
    document.getElementById('adminSection').classList.remove('d-none');
    loadProducts();
  } else if (role === 'Owner') {
    document.getElementById('staffSection').classList.remove('d-none');
    document.getElementById('adminSection').classList.remove('d-none');
    document.getElementById('ownerSection').classList.remove('d-none');
    loadProducts();
    loadStats();
  }
}

// 3. Product & Inventory Engine
async function loadProducts() {
  const grid = document.getElementById('productGrid');
  grid.innerHTML = `<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>`;
  
  const res = await apiCall('getProducts');
  if (res.success) {
    products = res.products;
    renderProducts(products);
  } else {
    grid.innerHTML = `<div class="col-12 text-center text-danger py-4">Failed to load inventory.</div>`;
  }
}

function renderProducts(items) {
  const grid = document.getElementById('productGrid');
  if (items.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-muted py-4">No products found.</div>`;
    return;
  }

  grid.innerHTML = items.map(p => `
    <div class="col">
      <div class="card product-card p-2 text-center h-100 shadow-sm" onclick="addToCart('${p.barcode}')">
        <div class="fw-bold text-dark text-truncate" title="${p.name}">${p.name}</div>
        <div class="small text-primary fw-bold">${p.price} MMK</div>
        <div class="badge ${p.stock > 5 ? 'bg-secondary' : 'bg-danger'} mt-1">Stock: ${p.stock}</div>
      </div>
    </div>
  `).join('');
}

// Barcode Search Listener
document.getElementById('barcodeInput').addEventListener('keyup', (e) => {
  const query = e.target.value.trim().toLowerCase();
  
  if (e.key === 'Enter' && query !== '') {
    const matched = products.find(p => p.barcode.toString().toLowerCase() === query);
    if (matched) {
      addToCart(matched.barcode);
      e.target.value = '';
      renderProducts(products);
    } else {
      alert("Product not found with barcode: " + query);
    }
  } else {
    const filtered = products.filter(p => 
      p.name.toLowerCase().includes(query) || 
      p.barcode.toString().toLowerCase().includes(query)
    );
    renderProducts(filtered);
  }
});

// 4. Cart Logic
function addToCart(barcode) {
  const prod = products.find(p => p.barcode.toString() === barcode.toString());
  if (!prod) return;

  if (prod.stock <= 0) {
    alert("Out of stock!");
    return;
  }

  const existing = cart.find(item => item.barcode.toString() === barcode.toString());
  if (existing) {
    if (existing.qty + 1 > prod.stock) {
      alert("Cannot exceed available stock limit!");
      return;
    }
    existing.qty++;
  } else {
    cart.push({ barcode: prod.barcode, name: prod.name, price: Number(prod.price), qty: 1 });
  }
  calculateCart();
}

function updateCartQty(index, newQty) {
  const qty = Number(newQty);
  if (qty <= 0) {
    cart.splice(index, 1);
  } else {
    const prod = products.find(p => p.barcode.toString() === cart[index].barcode.toString());
    if (prod && qty > prod.stock) {
      alert("Cannot exceed available stock!");
      return;
    }
    cart[index].qty = qty;
  }
  calculateCart();
}

function calculateCart() {
  const tbody = document.getElementById('cartTable');
  
  if (cart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Cart is empty</td></tr>`;
    document.getElementById('subTotal').innerText = "0 MMK";
    document.getElementById('grandTotal').innerText = "0 MMK";
    return;
  }

  tbody.innerHTML = cart.map((item, i) => `
    <tr>
      <td class="text-truncate" style="max-width: 120px;">${item.name}</td>
      <td class="text-center">
        <input type="number" class="form-control form-control-sm text-center px-1" value="${item.qty}" min="1" onchange="updateCartQty(${i}, this.value)">
      </td>
      <td class="text-end">${item.price * item.qty}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="updateCartQty(${i}, 0)">&times;</button>
      </td>
    </tr>
  `).join('');

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = Number(document.getElementById('discountInput').value) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  document.getElementById('subTotal').innerText = subtotal + " MMK";
  document.getElementById('grandTotal').innerText = grandTotal + " MMK";
}

function holdOrder() {
  if (cart.length === 0) {
    if (heldCart) {
      cart = [...heldCart];
      heldCart = null;
      calculateCart();
      alert("Held order restored!");
    } else {
      alert("Cart is empty!");
    }
    return;
  }

  heldCart = [...cart];
  cart = [];
  calculateCart();
  alert("Order placed on hold. Click 'Hold' again on an empty cart to restore.");
}

// 5. Checkout & Receipt Printing
async function processCheckout() {
  if (cart.length === 0) return alert("Cart is empty!");

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.innerText = "Processing...";

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = Number(document.getElementById('discountInput').value) || 0;
  const grandTotal = Math.max(0, subtotal - discount);

  const payload = {
    items: cart,
    subtotal: subtotal,
    discount: discount,
    total: grandTotal,
    paymentMethod: document.getElementById('payMethod').value,
    cashier: currentUser.username
  };

  const res = await apiCall('checkout', payload);
  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-print me-1"></i> Pay & Print`;

  if (res.success) {
    triggerPrint(res.voucherId, payload);
    cart = [];
    document.getElementById('discountInput').value = 0;
    calculateCart();
    loadProducts(); // Sync updated stock
  } else {
    alert("Checkout Failed: " + res.message);
  }
}

function triggerPrint(voucherId, data) {
  document.getElementById('rVoucher').innerText = voucherId;
  document.getElementById('rDate').innerText = new Date().toLocaleString();
  document.getElementById('rCashier').innerText = data.cashier;
  document.getElementById('rSubtotal').innerText = data.subtotal + " MMK";
  document.getElementById('rDiscount').innerText = data.discount + " MMK";
  document.getElementById('rTotal').innerText = data.total + " MMK";
  document.getElementById('rPayMethod').innerText = data.paymentMethod;

  document.getElementById('rItems').innerHTML = data.items.map(i => `
    <div class="d-flex justify-content-between">
      <span>${i.name} x${i.qty}</span>
      <span>${i.price * i.qty} MMK</span>
    </div>
  `).join('');

  document.getElementById('printArea').classList.remove('d-none');
  window.print();
  document.getElementById('printArea').classList.add('d-none');
}

// 6. Admin Forms Handler
document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    barcode: document.getElementById('pBarcode').value.trim(),
    name: document.getElementById('pName').value.trim(),
    category: document.getElementById('pCategory').value.trim(),
    cost: Number(document.getElementById('pCost').value),
    price: Number(document.getElementById('pPrice').value),
    stock: Number(document.getElementById('pStock').value)
  };

  const res = await apiCall('addProduct', payload);
  if (res.success) {
    alert("Product added successfully!");
    e.target.reset();
    loadProducts();
  } else {
    alert("Error adding product: " + res.message);
  }
});

// 7. Owner Forms & Dashboard Analytics
async function loadStats() {
  const res = await apiCall('getStats');
  if (res.success) {
    document.getElementById('statSales').innerText = (res.stats.totalSales || 0) + " MMK";
    document.getElementById('statExp').innerText = (res.stats.totalExpenses || 0) + " MMK";
    document.getElementById('statProfit').innerText = (res.stats.netProfit || 0) + " MMK";
  }
}

document.getElementById('expForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    category: document.getElementById('expCat').value.trim(),
    amount: Number(document.getElementById('expAmt').value),
    description: document.getElementById('expDesc').value.trim(),
    recordedBy: currentUser.username
  };

  const res = await apiCall('addExpense', payload);
  if (res.success) {
    alert("Expense recorded successfully!");
    e.target.reset();
    loadStats();
  } else {
    alert("Error recording expense: " + res.message);
  }
});

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    username: document.getElementById('uName').value.trim(),
    password: document.getElementById('uPass').value.trim(),
    role: document.getElementById('uRole').value
  };

  const res = await apiCall('createUser', payload);
  if (res.success) {
    alert("User account created successfully!");
    e.target.reset();
  } else {
    alert("Error creating user: " + res.message);
  }
});