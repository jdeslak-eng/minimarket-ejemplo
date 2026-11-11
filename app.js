// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = "https://tkbefmpebkcnactixeey.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fOsForK5vIsGJXfgGuJuDQ_dbkPH4ew"; 

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// VARIABLES GLOBALES DEL SISTEMA
// ==========================================
let products = [];
let cart = JSON.parse(localStorage.getItem('caminoB_cart')) || [];

function saveCartToStorage() {
  localStorage.setItem('caminoB_cart', JSON.stringify(cart));
}
let salesHistory = JSON.parse(localStorage.getItem('pos_sales')) || [];
let cashCutHistory = JSON.parse(localStorage.getItem('pos_cash_cuts')) || [];

let selectedCategory = 'Todos';
let selectedPaymentMethod = 'cash';
let barcodeBuffer = "";
let barcodeTimer = null;
let currentSaleDetails = null;

// ==========================================
// INICIALIZACIÓN AL CARGAR LA PÁGINA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  loadProductsFromSupabase();
  setupBarcodeScanner();
  renderCart();
  renderSales();
  renderCashHistory();
});

// ==========================================
// SINCRONIZACIÓN CON SUPABASE (NUBE / WI-FI)
// ==========================================
async function loadProductsFromSupabase() {
  const { data, error } = await supabaseClient
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.warn('Modo offline: cargando inventario local', error);
    products = JSON.parse(localStorage.getItem('pos_products')) || [];
  } else {
    products = data || [];
    localStorage.setItem('pos_products', JSON.stringify(products));
  }
  
  initUI();
}

// ==========================================
// SOPORTE PARA LECTOR DE CÓDIGO DE BARRAS
// ==========================================
function setupBarcodeScanner() {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.target.id !== 'search-input') return;

    if (e.key === 'Enter') {
      if (barcodeBuffer.trim().length > 0) {
        processBarcodeScan(barcodeBuffer.trim());
        barcodeBuffer = "";
      }
    } else if (e.key.length === 1) {
      barcodeBuffer += e.key;
      clearTimeout(barcodeTimer);
      barcodeTimer = setTimeout(() => { barcodeBuffer = ""; }, 100); 
    }
  });
}

function processBarcodeScan(code) {
  const product = products.find(p => p.barcode === code || p.id == code);
  if (product) {
    addToCart(product.id);
  } else {
    alert(`⚠️ Producto no registrado con código: ${code}`);
  }
}

// ==========================================
// GESTIÓN DEL CARRITO
// ==========================================
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (product.stock <= 0) {
    alert('¡Sin stock disponible para este producto!');
    return;
  }

  const existingItem = cart.find(item => item.id === productId);
  if (existingItem) {
    if (existingItem.quantity < product.stock) {
      existingItem.quantity++;
    } else {
      alert('Límite de stock alcanzado.');
    }
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      quantity: 1
    });
  }

  saveCartState();
  renderCart();
}

function saveCartState() {
  localStorage.setItem('pos_cart', JSON.stringify(cart));
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;

  container.innerHTML = '';
  let subtotal = 0;

  if (cart.length === 0) {
    container.innerHTML = `<div class="text-center text-stone-400 py-8 text-xs">El carrito está vacío</div>`;
    const btnPay = document.getElementById('btn-pay');
    if (btnPay) btnPay.setAttribute('disabled', 'true');
  } else {
    const btnPay = document.getElementById('btn-pay');
    if (btnPay) btnPay.removeAttribute('disabled');
    
    cart.forEach(item => {
      subtotal += item.price * item.quantity;
      container.innerHTML += `
        <div class="flex justify-between items-center py-2 border-b border-stone-100 text-xs">
          <div>
            <p class="font-bold text-stone-800">${item.name}</p>
            <p class="text-stone-500">Q ${item.price.toFixed(2)} x ${item.quantity}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-stone-900">Q ${(item.price * item.quantity).toFixed(2)}</span>
            <button onclick="removeFromCart(${item.id})" class="text-rose-500 hover:text-rose-700 px-1"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    });
  }

  document.getElementById('cart-subtotal').innerText = `Q ${subtotal.toFixed(2)}`;
  document.getElementById('cart-total').innerText = `Q ${subtotal.toFixed(2)}`;
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.id !== productId);
  saveCartState();
  renderCart();
}

function clearCart() {
  cart = [];
  saveCartState();
  renderCart();
}

// ==========================================
// NAVEGACIÓN Y VISTAS
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll('main').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  const targetView = document.getElementById(`view-${tabId}`);
  const targetBtn = document.getElementById(`btn-${tabId}`);

  if (targetView) targetView.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active');

  if (tabId === 'cash') updateCashCutView();
  
  // 💡 Si cambias a la pestaña de historial/ventas, cargamos desde Supabase
  if (tabId === 'sales') {
    cargarHistorialVentas();
  }
}

function initUI() {
  renderCategories();
  renderProducts();
  renderInventory();
}

function renderCategories() {
  const container = document.getElementById('categories-container');
  if (!container) return;

  const categories = ['Todos', ...new Set(products.map(p => p.category))];
  container.innerHTML = categories.map(cat => `
    <button onclick="filterByCategory('${cat}')" class="category-chip ${selectedCategory === cat ? 'active' : ''}">${cat}</button>
  `).join('');
}

function filterByCategory(category) {
  selectedCategory = category;
  renderCategories();
  renderProducts();
}

function filterProducts() {
  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('products-grid');
  if (!container) return;

  const query = document.getElementById('search-input')?.value.toLowerCase() || '';
  let filtered = products;

  if (selectedCategory !== 'Todos') {
    filtered = filtered.filter(p => p.category === selectedCategory);
  }

  if (query.trim() !== '') {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(query) || (p.barcode && p.barcode.includes(query)));
  }

  container.innerHTML = filtered.map(p => `
    <div onclick="addToCart(${p.id})" class="product-card cursor-pointer bg-white p-3 rounded-xl border border-stone-200 hover:border-stone-400 transition shadow-sm">
      <div class="text-stone-700 text-lg mb-2"><i class="fa-solid ${p.icon || 'fa-box'}"></i></div>
      <h4 class="font-bold text-xs text-stone-800 line-clamp-1">${p.name}</h4>
      <p class="text-stone-500 text-[10px] mb-2">Stock: ${p.stock}</p>
      <span class="font-extrabold text-xs text-stone-900">Q ${p.price.toFixed(2)}</span>
    </div>
  `).join('');
}

function renderInventory() {
  const tbody = document.getElementById('inventory-table-body');
  if (!tbody) return;

  tbody.innerHTML = products.map(p => `
    <tr class="border-b border-stone-100">
      <td class="py-2.5 font-medium text-stone-800">${p.name}</td>
      <td class="text-stone-500">${p.category}</td>
      <td class="font-bold text-stone-900">Q ${p.price.toFixed(2)}</td>
      <td class="text-stone-600">${p.stock}</td>
      <td class="text-right font-mono text-xs text-stone-500">${p.barcode || 'S/C'}</td>
      
      <td class="px-4 py-3 flex gap-2">
        <button onclick="editProduct('${p.id}')" title="Editar Producto" class="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
        <button onclick="addStock('${p.id}', ${p.stock})" title="Agregar Stock" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-plus"></i> Stock
        </button>
        <button onclick="deleteProduct('${p.id}')" title="Eliminar Producto" class="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// Escuchar cambios en el input de efectivo
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'pay-amount-input') {
    const totalPayElement = document.getElementById('modal-total-pay');
    const changeText = document.getElementById('pay-change-text');
    if (!totalPayElement || !changeText) return;

    const totalText = totalPayElement.innerText.replace('Q', '');
    const total = parseFloat(totalText) || 0;
    const paid = parseFloat(e.target.value) || 0;
    const change = paid - total;
    changeText.innerText = `Q${change >= 0 ? change.toFixed(2) : '0.00'}`;
  }
});

function closePaymentModal() {
  document.getElementById('modal-payment').classList.add('hidden');
}

function setPaymentMethod(method) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`pay-${method}`).classList.add('active');

  const calc = document.getElementById('cash-calculator');
  if (method === 'cash') {
    calc.classList.remove('hidden');
  } else {
    calc.classList.add('hidden');
  }
}

// ==========================================
// CARGAR HISTORIAL DESDE SUPABASE (Tabla: sales)
// ==========================================
async function cargarHistorialVentas() {
  const tbody = document.getElementById('sales-table-body');
  const totalDayEl = document.getElementById('sales-total-day');
  
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="text-center py-4 text-stone-500">Cargando historial...</td>
    </tr>
  `;

  // Traer las ventas de Supabase (tabla 'sales')
  const { data: ventas, error } = await supabaseClient
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al obtener ventas:', error.message);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-red-500">Error al cargar historial</td>
      </tr>
    `;
    return;
  }

  if (!ventas || ventas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-4 text-stone-500">No hay ventas registradas todavía.</td>
      </tr>
    `;
    if (totalDayEl) totalDayEl.textContent = 'Q 0.00';
    return;
  }

  tbody.innerHTML = '';
  let totalAcumulado = 0;

  ventas.forEach(venta => {
    totalAcumulado += Number(venta.total || 0);

    // 💡 FORMATO COMPLETO: Día/Mes/Año, Hora:Minutos (ej. 11/11/2026, 02:45 PM)
    const fechaCompleta = new Date(venta.created_at).toLocaleString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    let itemsArray = venta.items;
    if (typeof itemsArray === 'string') {
      try { itemsArray = JSON.parse(itemsArray); } catch (e) { itemsArray = []; }
    }

    const resumenItems = Array.isArray(itemsArray)
      ? itemsArray.map(p => `${p.name || p.nombre || 'Producto'} (${p.quantity || p.cantidad || 1})`).join(', ')
      : 'Sin detalle';

    tbody.innerHTML += `
      <tr class="border-b border-stone-100 text-xs">
        <td class="py-2.5 font-bold text-stone-800">#${venta.id}</td>
        <td class="text-stone-500">${fechaCompleta}</td>
        <td><span class="px-2 py-0.5 bg-stone-100 rounded text-[10px] font-medium uppercase">${venta.payment_method || 'Efectivo'}</span></td>
        <td class="text-stone-600">${resumenItems}</td>
        <td class="text-right font-extrabold text-stone-900">Q ${Number(venta.total).toFixed(2)}</td>
      </tr>
    `;
  });

  if (totalDayEl) {
    totalDayEl.textContent = `Q ${totalAcumulado.toFixed(2)}`;
  }
}

// ==========================================
// MÓDULO DE COBRO GLOBAL Y SEGURO
// ==========================================
window.openPaymentModal = function() {
  if (typeof cart === 'undefined' || cart.length === 0) {
    alert("El carrito está vacío. Agrega productos antes de cobrar.");
    return;
  }

  const total = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  
  const modalPayment = document.getElementById('modal-payment');
  const totalPayElement = document.getElementById('modal-total-pay');
  const payInput = document.getElementById('pay-amount-input');
  const changeText = document.getElementById('pay-change-text');

  if (!modalPayment) {
    alert("⚠️ Falta agregar el HTML del modal de pago en tu index.html.");
    return;
  }

  if (totalPayElement) totalPayElement.innerText = `Q${total.toFixed(2)}`;
  if (payInput) payInput.value = '';
  if (changeText) changeText.innerText = 'Q0.00';
  
  modalPayment.classList.remove('hidden');
};

window.closePaymentModal = function() {
  const modalPayment = document.getElementById('modal-payment');
  if (modalPayment) modalPayment.classList.add('hidden');
};

window.processSale = async function() {
  const currentCart = (typeof cart !== 'undefined' ? cart : []);
  if (currentCart.length === 0) {
    alert("El carrito está vacío.");
    return;
  }

  const total = currentCart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0);
  
  const payInput = document.getElementById('pay-amount-input');
  const payAmount = (payInput && payInput.value !== '') ? parseFloat(payInput.value) : total;

  if (payAmount < total) {
    alert("El monto ingresado es menor al total a pagar.");
    return;
  }

  // 1. Descontar stock en Supabase
  for (const item of currentCart) {
    const stockActual = Number(item.stock) || 0;
    const cantidadVendida = Number(item.quantity) || 1;
    const nuevoStock = stockActual - cantidadVendida;

    const { error } = await supabaseClient
      .from('products')
      .update({ stock: nuevoStock })
      .eq('id', item.id);

    if (error) console.error(`Error al actualizar stock de ${item.name}:`, error);
  }

  // 2. Registrar venta en Supabase (tabla 'sales')
  const { error: saleError } = await supabaseClient
    .from('sales')
    .insert([{ 
      total: total, 
      payment_method: selectedPaymentMethod || 'cash', 
      items: currentCart 
    }]);

  if (saleError) {
    console.error("Error al registrar la venta:", saleError);
    alert("⚠️ Ocurrió un error al guardar la venta en la nube.");
    return;
  }

  // 3. Vaciar carrito
  cart = [];
  saveCartState();
  renderCart();
  
  // 4. Cerrar modal y refrescar
  const modalPayment = document.getElementById('modal-payment');
  if (modalPayment) modalPayment.classList.add('hidden');

  await loadProductsFromSupabase();
  cargarHistorialVentas();

  alert("✅ ¡Venta realizada con éxito, inventario actualizado y registrada en el historial!");
};

// ==========================================
// SUPABASE REALTIME & GESTIÓN DE PRODUCTOS
// ==========================================
function setupSupabaseRealtime() {
  if (typeof supabaseClient === 'undefined') return;

  supabaseClient
    .channel('public:products')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      async (payload) => {
        if (typeof loadProductsFromSupabase === 'function') {
          await loadProductsFromSupabase();
        }
      }
    )
    .subscribe();
}

document.addEventListener('DOMContentLoaded', () => {
  setupSupabaseRealtime();
});

window.deleteProduct = async function(productId) {
  if (!confirm("¿Estás seguro de que deseas eliminar este producto del inventario?")) return;

  const { error } = await supabaseClient.from('products').delete().eq('id', productId);
  if (error) {
    alert("Hubo un error al intentar eliminar el producto.");
  } else {
    alert("🗑️ Producto eliminado con éxito.");
    await loadProductsFromSupabase();
  }
};

window.addStock = async function(productId, currentStock) {
  const input = prompt(`Stock actual: ${currentStock}\n¿Cuántas unidades deseas agregar?:`, "0");
  const quantityToAdd = parseInt(input);

  if (isNaN(quantityToAdd) || quantityToAdd <= 0) return;

  const newStock = Number(currentStock) + quantityToAdd;
  const { error } = await supabaseClient.from('products').update({ stock: newStock }).eq('id', productId);

  if (error) {
    alert("Error al sumar el stock.");
  } else {
    alert(`✅ ¡Stock actualizado! Nuevo total: ${newStock} unidades.`);
    await loadProductsFromSupabase();
  }
};

window.editProduct = function(productId) {
  const product = products.find(p => String(p.id) === String(productId));
  if (!product) return;

  document.getElementById('edit-product-id').value = product.id;
  document.getElementById('edit-name').value = product.name || '';
  document.getElementById('edit-category').value = product.category || '';
  document.getElementById('edit-price').value = product.price || 0;
  document.getElementById('edit-barcode').value = product.barcode || '';

  const modal = document.getElementById('modal-edit');
  if (modal) modal.classList.remove('hidden');
};

window.closeEditModal = function() {
  const modal = document.getElementById('modal-edit');
  if (modal) modal.classList.add('hidden');
};

window.saveEditedProduct = async function() {
  const productId = document.getElementById('edit-product-id').value;
  const newName = document.getElementById('edit-name').value.trim();
  const newCategory = document.getElementById('edit-category').value.trim();
  const newPrice = parseFloat(document.getElementById('edit-price').value);
  const rawBarcode = document.getElementById('edit-barcode').value.trim();

  if (!newName || isNaN(newPrice)) {
    alert("Por favor completa los campos obligatorios.");
    return;
  }

  const newBarcode = rawBarcode !== "" ? rawBarcode : null;

  const { error } = await supabaseClient
    .from('products')
    .update({ name: newName, category: newCategory, price: newPrice, barcode: newBarcode })
    .eq('id', productId);

  if (error) {
    alert("Hubo un error al guardar los cambios.");
  } else {
    closeEditModal();
    await loadProductsFromSupabase();
    alert("✅ ¡Producto actualizado con éxito!");
  }
};