const API_URL = "https://script.google.com/macros/s/AKfycbyII8t4aCCMmIWQ3s8qWiSHagWbiNUblk4A1FL-iL17uCLVeWlqtRpVDOqSIXotZe7b/exec"; 

let currentUser = null;
let products = [];
let cart = [];
let autoRefreshTimer = null;
let isSyncing = false;

// API Fetch Helper
async function apiCall(action, payload = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return await response.json();
  } catch (err) {
    console.error("API Fetch Error:", err);
    return { success: false, message: "Network connection error." };
  }
}

// Custom Dialog Helpers
function showAlert(message, title = "Notification") {
  document.getElementById('alertModalTitle').innerText = title;
  document.getElementById('alertModalBody').innerText = message;
  const modal = new bootstrap.Modal(document.getElementById('customAlertModal'));
  modal.show();
}

function showConfirm(message, onConfirm) {
  document.getElementById('confirmModalBody').innerText = message;
  const modalBtn = document.getElementById('confirmModalBtn');
  const modalEl = document.getElementById('customConfirmModal');
  const modal = new bootstrap.Modal(modalEl);

  const handleConfirm = () => {
    modalBtn.removeEventListener('click', handleConfirm);
    modal.hide();
    if (onConfirm) onConfirm();
  };

  modalBtn.onclick = handleConfirm;
  modal.show();
}

// Security Check strictly checks currently logged in user password
function requireAdminAuth(onSuccess) {
  document.getElementById('authModalUserLabel').innerText = `Enter password for logged-in user (${currentUser.username}) to approve:`;
  document.getElementById('authModalPassword').value = '';
  
  const modalEl = document.getElementById('customAuthModal');
  const modal = new bootstrap.Modal(modalEl);
  const submitBtn = document.getElementById('authModalSubmitBtn');

  submitBtn.onclick = async () => {
    const enteredPass = document.getElementById('authModalPassword').value.trim();
    if (!enteredPass) {
      showAlert("Password is required.");
      return;
    }

    modal.hide();
    
    // Verify specifically against currentUser.username
    const res = await apiCall('verifyPassword', {
      username: currentUser.username,
      password: enteredPass
    });

    if (res.success) {
      if (onSuccess) onSuccess();
    } else {
      showAlert("Security Verification Failed: Incorrect password for " + currentUser.username);
    }
  };

  modal.show();
}

// Background Auto-Sync
function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(async () => {
    if (!currentUser || isSyncing) return;
    isSyncing = true;
    
    const resProd = await apiCall('getProducts');
    if (resProd.success && JSON.stringify(resProd.products) !== JSON.stringify(products)) {
      products = resProd.products || [];
      if (currentUser.role === 'Staff') {
        filterPOSProducts();
      }
      filterStockTable();
    }

    if (currentUser.role === 'Owner') {
      const resStats = await apiCall('getStats');
      if (resStats.success && resStats.stats) {
        document.getElementById('statSales').innerText = (resStats.stats.totalSales || 0) + " MMK";
        document.getElementById('statExp').innerText = (resStats.stats.totalExpenses || 0) + " MMK";
        document.getElementById('statProfit').innerText = (resStats.stats.netProfit || 0) + " MMK";
      }
    }

    if (currentUser.role === 'Admin' || currentUser.role === 'Owner') {
      const activeGroup = document.querySelector('.mgmt-main-group:not(.d-none)')?.id;
      if (activeGroup === 'vouchersPanel') loadVouchers();
      else if (activeGroup === 'salesPanel') loadSales();
      else if (activeGroup === 'expenseMainGroup') loadExpenses();
      else if (activeGroup === 'userMainGroup') loadUsersList();
    }

    isSyncing = false;
  }, 3000);
}

function focusBarcodeInput() {
  setTimeout(() => {
    const inp = document.getElementById('barcodeInput');
    if (inp) inp.focus();
  }, 100);
}

// Real-time Search Filtering on POS Input
document.getElementById('barcodeInput')?.addEventListener('input', (e) => {
  filterPOSProducts();
});

document.getElementById('barcodeInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const query = e.target.value.trim();
    if (query !== '') {
      processBarcodeAdd(query);
      e.target.value = '';
      filterPOSProducts();
    } else {
      processCheckout();
    }
  }
});

function filterPOSProducts() {
  const query = (document.getElementById('barcodeInput')?.value || '').trim().toLowerCase();
  const filtered = products.filter(p => {
    return String(p.name).toLowerCase().includes(query) || 
           String(p.barcode).toLowerCase().includes(query);
  });
  renderProducts(filtered);
}

function processBarcodeAdd(barcodeStr) {
  const matched = products.find(p => String(p.barcode) === String(barcodeStr));
  if (matched) {
    addToCart(matched.barcode);
  } else {
    showAlert("Product not found: " + barcodeStr);
  }
}

// Navigation Tab Switches
function switchMainTab(groupId, btnElement) {
  document.querySelectorAll('.mgmt-main-group').forEach(p => p.classList.add('d-none'));
  document.getElementById(groupId)?.classList.remove('d-none');

  if (btnElement) {
    document.querySelectorAll('#adminMenuButtons button').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
  }
}

function switchSubTab(panelId, btnElement) {
  const parentGroup = btnElement.closest('.mgmt-main-group');
  if (!parentGroup) return;

  parentGroup.querySelectorAll('.mgmt-panel').forEach(p => p.classList.add('d-none'));
  parentGroup.querySelector(`#${panelId}`)?.classList.remove('d-none');

  parentGroup.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  btnElement.classList.add('active');
}

// Login & Authentication
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
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
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  location.reload();
}

// Role Base View Control (POS Interface is HIDDEN for Admin & Owner)
function setupRoleViews() {
  document.querySelectorAll('.role-section').forEach(el => el.classList.add('d-none'));
  const role = currentUser.role;

  if (role === 'Staff') {
    document.getElementById('staffSection')?.classList.remove('d-none');
    loadProducts();
    focusBarcodeInput();
  } else if (role === 'Admin') {
    document.getElementById('managementSection')?.classList.remove('d-none');
    loadProducts();
  } else if (role === 'Owner') {
    document.getElementById('ownerSection')?.classList.remove('d-none');
    document.getElementById('managementSection')?.classList.remove('d-none');
    loadStats();
    loadProducts();
  }

  startAutoRefresh();
}

// Products Engine
async function loadProducts() {
  const res = await apiCall('getProducts');
  if (res.success) {
    products = res.products || [];
    if (currentUser && currentUser.role === 'Staff') {
      filterPOSProducts();
    }
    filterStockTable();
  }
  if (currentUser && currentUser.role === 'Staff') focusBarcodeInput();
}

function renderProducts(items) {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  if (items.length === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-muted py-4">No products found</div>`;
    return;
  }

  grid.innerHTML = items.map(p => `
    <div class="col">
      <div class="card product-card p-2 text-center h-100 shadow-sm" onclick="addToCart('${p.barcode}')">
        <div class="fw-bold text-dark text-truncate" title="${p.name}">${p.name}</div>
        <div class="small text-primary fw-bold">${p.price} MMK</div>
        <div class="badge ${p.stock > 5 ? 'bg-secondary' : 'bg-danger'} my-1">Stock: ${p.stock}</div>
        <div class="text-muted small"><strong>BC:</strong> ${p.barcode}</div>
        <div class="mt-1"><svg id="p-bc-${p.barcode}" class="barcode-svg"></svg></div>
      </div>
    </div>
  `).join('');

  // Render Barcode Graphics
  items.forEach(p => {
    try {
      JsBarcode(`#p-bc-${p.barcode}`, p.barcode, {
        format: "CODE128",
        width: 1,
        height: 25,
        displayValue: false
      });
    } catch(e) {}
  });
}

// Stock & Price Management
function filterStockTable() {
  const query = (document.getElementById('stockSearchInput')?.value || '').trim().toLowerCase();
  const filtered = products.filter(p => {
    return String(p.name).toLowerCase().includes(query) || 
           String(p.barcode).toLowerCase().includes(query) || 
           String(p.productId).toLowerCase().includes(query);
  });
  renderStockManageTable(filtered);
}

function renderStockManageTable(items) {
  const tbody = document.getElementById('stockManageTable');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">No products found</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(p => {
    const pKey = String(p.productId || p.barcode);
    return `
      <tr>
        <td>${pKey}</td>
        <td class="text-truncate" style="max-width: 120px;">${p.name}</td>
        <td>
          <div>${p.barcode}</div>
          <svg id="s-bc-${p.barcode}" class="barcode-svg"></svg>
        </td>
        <td>${p.price} MMK</td>
        <td><span class="badge ${p.stock > 5 ? 'bg-secondary' : 'bg-danger'}">${p.stock}</span></td>
        <td class="no-print">
          <button class="btn btn-sm btn-outline-primary py-0 me-1" onclick="openEditProductModal('${pKey}')"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
          <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteProduct('${pKey}', '${p.name}')"><i class="fa-solid fa-trash"></i> Delete</button>
        </td>
      </tr>
    `;
  }).join('');

  items.forEach(p => {
    try {
      JsBarcode(`#s-bc-${p.barcode}`, p.barcode, {
        format: "CODE128",
        width: 1,
        height: 25,
        displayValue: false
      });
    } catch(e) {}
  });
}

// Print Stock Table
function printStockTable() {
  window.print();
}

function openEditProductModal(productId) {
  const prod = products.find(p => String(p.productId || p.barcode) === String(productId));
  if (!prod) return;

  document.getElementById('modalProdId').value = productId;
  document.getElementById('modalProdName').value = prod.name;
  document.getElementById('modalProdPrice').value = prod.price;
  document.getElementById('modalProdCurrentStock').innerText = prod.stock;
  document.getElementById('modalProdStock').value = prod.stock;
  document.getElementById('modalProdStockQty').value = 0;

  const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
  modal.show();
}

function submitSaveProductEdit() {
  requireAdminAuth(async () => {
    const productId = document.getElementById('modalProdId').value;
    const currentStock = Number(document.getElementById('modalProdStock').value);
    const newPrice = Number(document.getElementById('modalProdPrice').value);
    const stockAction = document.getElementById('modalProdStockAction').value;
    const stockQty = Number(document.getElementById('modalProdStockQty').value) || 0;

    let finalStock = currentStock;
    if (stockAction === 'add') finalStock += stockQty;
    else if (stockAction === 'sub') finalStock = Math.max(0, currentStock - stockQty);

    const res = await apiCall('updateProduct', { productId, price: newPrice, stock: finalStock });
    
    bootstrap.Modal.getInstance(document.getElementById('editProductModal'))?.hide();

    if (res.success) {
      showAlert("Product updated successfully!");
      loadProducts();
    } else {
      showAlert("Failed: " + res.message);
    }
  });
}

function deleteProduct(productId, productName) {
  showConfirm(`Are you sure you want to delete "${productName}"?`, () => {
    requireAdminAuth(async () => {
      const res = await apiCall('deleteProduct', { productId });
      if (res.success) {
        showAlert("Product deleted successfully!");
        loadProducts();
      } else {
        showAlert("Failed to delete: " + res.message);
      }
    });
  });
}

// Cart Engine
function addToCart(barcode) {
  const prod = products.find(p => String(p.barcode) === String(barcode));
  if (!prod) return;

  if (prod.stock <= 0) return showAlert("Out of stock!");

  const existing = cart.find(item => String(item.barcode) === String(barcode));
  if (existing) {
    if (existing.qty + 1 > prod.stock) return showAlert("Exceeds available stock!");
    existing.qty++;
  } else {
    cart.push({ barcode: barcode, name: prod.name, price: Number(prod.price), qty: 1 });
  }
  calculateCart();
}

function updateCartQty(index, newQty) {
  const qty = Number(newQty);
  if (qty <= 0) {
    cart.splice(index, 1);
  } else {
    const prod = products.find(p => String(p.barcode) === String(cart[index].barcode));
    if (prod && qty > prod.stock) return showAlert("Exceeds stock limit!");
    cart[index].qty = qty;
  }
  calculateCart();
}

function calculateCart() {
  const tbody = document.getElementById('cartTable');
  if (!tbody) return;

  if (cart.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">Cart is empty</td></tr>`;
    document.getElementById('subTotal').innerText = "0 MMK";
    document.getElementById('grandTotal').innerText = "0 MMK";
    focusBarcodeInput();
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
  focusBarcodeInput();
}

// Checkout, POS Thermal Print & Save Receipt as JPEG Image
async function processCheckout() {
  if (cart.length === 0) return showAlert("Cart is empty!");

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.innerText = "Processing...";

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = Number(document.getElementById('discountInput').value) || 0;
  const grandTotal = Math.max(0, subtotal - discount);
  
  const rawNotes = document.getElementById('voucherNotes').value.trim();
  const notes = rawNotes !== "" ? rawNotes : "Null";

  const payload = {
    items: cart,
    subtotal: subtotal,
    discount: discount,
    total: grandTotal,
    paymentMethod: document.getElementById('payMethod').value,
    cashier: currentUser.username,
    notes: notes
  };

  const res = await apiCall('checkout', payload);
  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-print me-1"></i> Pay & Print (Enter)`;

  if (res.success) {
    await generateReceiptAndPrint(res.voucherId, res.date || new Date().toLocaleString(), payload);
    
    cart = [];
    document.getElementById('discountInput').value = 0;
    document.getElementById('voucherNotes').value = '';
    calculateCart();
    loadProducts();
  } else {
    showAlert("Checkout Failed: " + res.message);
  }
}

async function generateReceiptAndPrint(voucherId, dateStr, data) {
  document.getElementById('recVoucherId').innerText = voucherId;
  document.getElementById('recDate').innerText = dateStr;
  document.getElementById('recCashier').innerText = data.cashier;
  document.getElementById('recSubtotal').innerText = data.subtotal + " MMK";
  document.getElementById('recDiscount').innerText = data.discount + " MMK";
  document.getElementById('recTotal').innerText = data.total + " MMK";
  document.getElementById('recMethod').innerText = data.paymentMethod;
  document.getElementById('recNotes').innerText = data.notes;

  const itemsTbody = document.getElementById('recItems');
  itemsTbody.innerHTML = data.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td class="text-center">${i.qty}</td>
      <td class="text-end">${i.price}</td>
      <td class="text-end">${i.price * i.qty}</td>
    </tr>
  `).join('');

  try {
    JsBarcode("#recBarcodeSvg", voucherId, {
      format: "CODE128",
      width: 1.5,
      height: 40,
      displayValue: true
    });
  } catch(e) {}

  const printArea = document.getElementById('receiptPrintArea');
  printArea.classList.remove('d-none');

  // 1. Save Receipt as JPEG File using html2canvas
  try {
    const canvas = await html2canvas(printArea, { scale: 2 });
    const imageJpeg = canvas.toDataURL("image/jpeg", 0.9);
    
    const link = document.createElement('a');
    link.href = imageJpeg;
    link.download = `Receipt_${voucherId}.jpg`;
    link.click();
  } catch(e) {
    console.error("JPEG generation error:", e);
  }

  // 2. Trigger POS Printer Print
  window.print();
  printArea.classList.add('d-none');
}

// Users Management
async function loadUsersList() {
  const tbody = document.getElementById('userListTable');
  if (!tbody) return;

  const res = await apiCall('getUsers');
  let users = res.users || [];
  
  if (currentUser.role !== 'Owner') {
    users = users.filter(u => String(u.role).toLowerCase() !== 'owner');
  }

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const uId = String(u.userId);
    return `
      <tr>
        <td>${uId}</td>
        <td>${u.username}</td>
        <td>${u.role}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" onclick="openEditUserModal('${uId}', '${u.username}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditUserModal(userId, username) {
  document.getElementById('modalUserId').value = userId;
  document.getElementById('modalUserName').value = username;
  document.getElementById('modalUserOldPass').value = '';
  document.getElementById('modalUserNewPass').value = '';

  const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
  modal.show();
}

function submitSaveUserEdit() {
  requireAdminAuth(async () => {
    const userId = document.getElementById('modalUserId').value;
    const newUsername = document.getElementById('modalUserName').value.trim();
    const oldPass = document.getElementById('modalUserOldPass').value.trim();
    const newPass = document.getElementById('modalUserNewPass').value.trim();

    const res = await apiCall('updateUser', {
      userId: userId,
      username: newUsername,
      oldPassword: oldPass,
      newPassword: newPass
    });

    bootstrap.Modal.getInstance(document.getElementById('editUserModal'))?.hide();

    if (res.success) {
      showAlert("User updated successfully!");
      loadUsersList();
    } else {
      showAlert("Update Failed: " + res.message);
    }
  });
}

// Vouchers Management
async function loadVouchers() {
  const tbody = document.getElementById('voucherTableBody');
  if (!tbody) return;

  const res = await apiCall('getVouchers');
  const vouchers = res.vouchers || [];

  if (vouchers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted">No vouchers found</td></tr>`;
    return;
  }

  tbody.innerHTML = vouchers.map(v => {
    const vId = String(v.voucherId);
    return `
      <tr>
        <td>${vId}</td>
        <td>${v.date}</td>
        <td>${v.subtotal}</td>
        <td>${v.discount}</td>
        <td>${v.total}</td>
        <td>${v.paymentMethod}</td>
        <td>${v.cashier}</td>
        <td>${v.notes}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" onclick="openEditVoucherModal('${vId}', ${v.subtotal}, ${v.discount}, ${v.total}, '${v.notes}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditVoucherModal(id, sub, disc, tot, note) {
  document.getElementById('modalVoucherId').value = id;
  document.getElementById('modalVoucherSub').value = sub;
  document.getElementById('modalVoucherDisc').value = disc;
  document.getElementById('modalVoucherTotal').value = tot;
  document.getElementById('modalVoucherNotes').value = note;

  const modal = new bootstrap.Modal(document.getElementById('editVoucherModal'));
  modal.show();
}

function submitSaveVoucherEdit() {
  requireAdminAuth(async () => {
    const voucherId = document.getElementById('modalVoucherId').value;
    const rawNote = document.getElementById('modalVoucherNotes').value.trim();
    const payload = {
      voucherId: voucherId,
      subtotal: Number(document.getElementById('modalVoucherSub').value),
      discount: Number(document.getElementById('modalVoucherDisc').value),
      total: Number(document.getElementById('modalVoucherTotal').value),
      notes: rawNote !== "" ? rawNote : "Null"
    };

    const res = await apiCall('updateVoucher', payload);
    bootstrap.Modal.getInstance(document.getElementById('editVoucherModal'))?.hide();

    if (res.success) {
      showAlert("Voucher updated!");
      loadVouchers();
    } else {
      showAlert("Failed: " + res.message);
    }
  });
}

// Sales Management
async function loadSales() {
  const tbody = document.getElementById('salesTableBody');
  if (!tbody) return;

  const res = await apiCall('getSales');
  const sales = res.sales || [];

  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No sales records found</td></tr>`;
    return;
  }

  tbody.innerHTML = sales.map(s => {
    const sId = String(s.saleId);
    return `
      <tr>
        <td>${sId}</td>
        <td>${s.voucherId}</td>
        <td>${s.barcode}</td>
        <td>${s.productName}</td>
        <td>${s.qty}</td>
        <td>${s.price}</td>
        <td>${s.total}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" onclick="openEditSaleModal('${sId}', ${s.qty}, ${s.price}, ${s.total})">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditSaleModal(id, qty, price, tot) {
  document.getElementById('modalSaleId').value = id;
  document.getElementById('modalSaleQty').value = qty;
  document.getElementById('modalSalePrice').value = price;
  document.getElementById('modalSaleTotal').value = tot;

  const modal = new bootstrap.Modal(document.getElementById('editSaleModal'));
  modal.show();
}

function submitSaveSaleEdit() {
  requireAdminAuth(async () => {
    const saleId = document.getElementById('modalSaleId').value;
    const payload = {
      saleId: saleId,
      qty: Number(document.getElementById('modalSaleQty').value),
      price: Number(document.getElementById('modalSalePrice').value),
      total: Number(document.getElementById('modalSaleTotal').value)
    };

    const res = await apiCall('updateSale', payload);
    bootstrap.Modal.getInstance(document.getElementById('editSaleModal'))?.hide();

    if (res.success) {
      showAlert("Sale record updated!");
      loadSales();
    } else {
      showAlert("Failed: " + res.message);
    }
  });
}

// Expenses Management
async function loadExpenses() {
  const tbody = document.getElementById('expenseTableBody');
  if (!tbody) return;

  const res = await apiCall('getExpenses');
  const expenses = res.expenses || [];

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No expenses found</td></tr>`;
    return;
  }

  tbody.innerHTML = expenses.map(e => {
    const eId = String(e.expenseId);
    return `
      <tr>
        <td>${eId}</td>
        <td>${e.date}</td>
        <td>${e.category}</td>
        <td>${e.amount}</td>
        <td>${e.description}</td>
        <td>${e.recordedBy}</td>
        <td>
          <button class="btn btn-sm btn-outline-primary py-0" onclick="openEditExpenseModal('${eId}', '${e.category}', ${e.amount}, '${e.description}')">
            <i class="fa-solid fa-pen-to-square"></i> Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openEditExpenseModal(id, cat, amt, desc) {
  document.getElementById('modalExpenseId').value = id;
  document.getElementById('modalExpenseCat').value = cat;
  document.getElementById('modalExpenseAmt').value = amt;
  document.getElementById('modalExpenseDesc').value = desc;

  const modal = new bootstrap.Modal(document.getElementById('editExpenseModal'));
  modal.show();
}

function submitSaveExpenseEdit() {
  requireAdminAuth(async () => {
    const expenseId = document.getElementById('modalExpenseId').value;
    const payload = {
      expenseId: expenseId,
      category: document.getElementById('modalExpenseCat').value.trim(),
      amount: Number(document.getElementById('modalExpenseAmt').value),
      description: document.getElementById('modalExpenseDesc').value.trim()
    };

    const res = await apiCall('updateExpense', payload);
    bootstrap.Modal.getInstance(document.getElementById('editExpenseModal'))?.hide();

    if (res.success) {
      showAlert("Expense updated!");
      loadExpenses();
    } else {
      showAlert("Failed: " + res.message);
    }
  });
}

// Form Submission Events
document.getElementById('expForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  requireAdminAuth(async () => {
    const payload = {
      category: document.getElementById('expCat').value.trim(),
      amount: Number(document.getElementById('expAmt').value),
      description: document.getElementById('expDesc').value.trim(),
      recordedBy: currentUser.username
    };

    const res = await apiCall('addExpense', payload);
    if (res.success) {
      showAlert("Expense recorded!");
      e.target.reset();
      loadExpenses();
    } else {
      showAlert("Error: " + res.message);
    }
  });
});

document.getElementById('addProductForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  requireAdminAuth(async () => {
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
      showAlert("Product added!");
      e.target.reset();
      loadProducts();
    } else {
      showAlert("Error: " + res.message);
    }
  });
});

document.getElementById('userForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  requireAdminAuth(async () => {
    const payload = {
      username: document.getElementById('uName').value.trim(),
      password: document.getElementById('uPass').value.trim(),
      role: document.getElementById('uRole').value
    };

    const res = await apiCall('createUser', payload);
    if (res.success) {
      showAlert("User created successfully!");
      e.target.reset();
      loadUsersList();
    } else {
      showAlert("Error: " + res.message);
    }
  });
});

// Analytics Engine
async function loadStats() {
  const res = await apiCall('getStats');
  if (res.success && res.stats) {
    document.getElementById('statSales').innerText = (res.stats.totalSales || 0) + " MMK";
    document.getElementById('statExp').innerText = (res.stats.totalExpenses || 0) + " MMK";
    document.getElementById('statProfit').innerText = (res.stats.netProfit || 0) + " MMK";
  }
}