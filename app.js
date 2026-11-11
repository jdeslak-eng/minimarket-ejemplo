// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = "https://tkbefmpebkcnactixeey.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_fOsForK5vIsGJXfgGuJuDQ_dbkPH4ew"; // Reemplaza con tu clave anon public de Supabase

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// VARIABLES GLOBALES DEL SISTEMA
// ==========================================
let products = [];
// Cargar el carrito guardado previamente (si recargas la página, no se borra)
let cart = JSON.parse(localStorage.getItem('caminoB_cart')) || [];

// Función auxiliar para guardar el carrito cada vez que sufra cambios
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

  document.getElementById(`view-${tabId}`).classList.remove('hidden');
  document.getElementById(`btn-${tabId}`).classList.add('active');

  if (tabId === 'cash') updateCashCutView();
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
        <!-- ✏️ Botón para Editar -->
        <button onclick="editProduct('${p.id}')" title="Editar Producto" class="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-pen"></i> Editar
        </button>

        <!-- ➕ Botón para sumar stock -->
        <button onclick="addStock('${p.id}', ${p.stock})" title="Agregar Stock" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-plus"></i> Stock
        </button>

        <!-- 🗑️ Botón para eliminar el producto -->
        <button onclick="deleteProduct('${p.id}')" title="Eliminar Producto" class="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}


// Escuchar cambios en el input de efectivo para calcular el cambio de forma segura
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

function calculateChange() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const received = parseFloat(document.getElementById('cash-received').value) || 0;
  const change = received - total;
  document.getElementById('cash-change').innerText = `Q ${change >= 0 ? change.toFixed(2) : '0.00'}`;
}

async function processSale() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  if (selectedPaymentMethod === 'cash') {
    const received = parseFloat(document.getElementById('cash-received').value) || 0;
    if (received < total) {
      alert('El monto recibido es menor al total a pagar.');
      return;
    }
  }

  const saleRecord = {
    id: 'V-' + Math.floor(100000 + Math.random() * 900000),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toLocaleDateString(),
    method: selectedPaymentMethod,
    items: [...cart],
    total: total
  };

  salesHistory.unshift(saleRecord);
  localStorage.setItem('pos_sales', JSON.stringify(salesHistory));

  // Descontar stock localmente y sincronizar con Supabase
  for (const item of cart) {
    const p = products.find(prod => prod.id === item.id);
    if (p) {
      p.stock -= item.quantity;
      await supabaseClient.from('products').update({ stock: p.stock }).eq('id', p.id);
    }
  }

  // Guardar venta en Supabase
  await supabaseClient.from('sales').insert([{
    total: total,
    payment_method: selectedPaymentMethod,
    items: cart
  }]);

  cart = [];
  saveCartState();
  renderCart();
  renderSales();
  closePaymentModal();
  initUI();

  alert(`✅ Venta procesada con éxito. ID: ${saleRecord.id}`);
}

function renderSales() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  let totalDay = salesHistory.reduce((sum, s) => sum + s.total, 0);
  const totalLabel = document.getElementById('sales-total-day');
  if (totalLabel) totalLabel.innerText = `Q ${totalDay.toFixed(2)}`;

  tbody.innerHTML = salesHistory.map(s => `
    <tr class="border-b border-stone-100 text-xs">
      <td class="py-2.5 font-bold text-stone-800">${s.id}</td>
      <td class="text-stone-500">${s.time}</td>
      <td><span class="px-2 py-0.5 bg-stone-100 rounded text-[10px] font-medium uppercase">${s.method}</span></td>
      <td class="text-stone-600">${s.items.reduce((sum, i) => sum + i.quantity, 0)} ítems</td>
      <td class="text-right font-extrabold text-stone-900">Q ${s.total.toFixed(2)}</td>
    </tr>
  `).join('');
}

// ==========================================
// CORTE DE CAJA
// ==========================================
function updateCashCutView() {
  const cashTotal = salesHistory.filter(s => s.method === 'cash').reduce((sum, s) => sum + s.total, 0);
  const digitalTotal = salesHistory.filter(s => s.method !== 'cash').reduce((sum, s) => sum + s.total, 0);
  const overall = cashTotal + digitalTotal;

  document.getElementById('cash-sales-total').innerText = `Q ${cashTotal.toFixed(2)}`;
  document.getElementById('digital-sales-total').innerText = `Q ${digitalTotal.toFixed(2)}`;
  document.getElementById('overall-sales-total').innerText = `Q ${overall.toFixed(2)}`;
}

function calculateCashDifference() {
  const initial = parseFloat(document.getElementById('cash-initial').value) || 0;
  const counted = parseFloat(document.getElementById('cash-counted').value) || 0;
  const cashSales = salesHistory.filter(s => s.method === 'cash').reduce((sum, s) => sum + s.total, 0);
  const expected = initial + cashSales;
  const diff = counted - expected;

  const diffEl = document.getElementById('cash-difference');
  diffEl.innerText = `Q ${diff.toFixed(2)}`;
  diffEl.className = `font-extrabold text-sm ${diff < 0 ? 'text-rose-600' : 'text-emerald-600'}`;
}

function startNewDay() {
  if (confirm('¿Deseas cerrar el turno y archivar el corte de caja?')) {
    const cashTotal = salesHistory.filter(s => s.method === 'cash').reduce((sum, s) => sum + s.total, 0);
    const digitalTotal = salesHistory.filter(s => s.method !== 'cash').reduce((sum, s) => sum + s.total, 0);
    
    const cutRecord = {
      id: 'C-'.concat(Math.floor(1000 + Math.random() * 9000)),
      date: new Date().toLocaleString(),
      initial: parseFloat(document.getElementById('cash-initial').value) || 0,
      cash: cashTotal,
      digital: digitalTotal,
      total: cashTotal + digitalTotal,
      diff: document.getElementById('cash-difference').innerText
    };

    cashCutHistory.unshift(cutRecord);
    localStorage.setItem('pos_cash_cuts', JSON.stringify(cashCutHistory));
    
    salesHistory = [];
    localStorage.removeItem('pos_sales');
    renderSales();
    renderCashHistory();
    updateCashCutView();
    alert('✅ Corte de caja guardado con éxito.');
  }
}

function renderCashHistory() {
  const tbody = document.getElementById('cash-history-table-body');
  if (!tbody) return;

  tbody.innerHTML = cashCutHistory.map(c => `
    <tr class="border-b border-stone-100 text-xs">
      <td class="py-2.5 font-medium text-stone-800">${c.date}</td>
      <td>Q ${c.initial.toFixed(2)}</td>
      <td>Q ${c.cash.toFixed(2)}</td>
      <td>Q ${c.digital.toFixed(2)}</td>
      <td class="font-bold text-stone-900">Q ${c.total.toFixed(2)}</td>
      <td>${c.diff}</td>
      <td class="text-right font-mono text-stone-500">${c.id}</td>
    </tr>
  `).join('');
}

// Modales Auxiliares
function openCustomItemModal() {
  document.getElementById('modal-custom').classList.remove('hidden');
}
function closeCustomItemModal() {
  document.getElementById('modal-custom').classList.add('hidden');
}
function addCustomItem() {
  const name = document.getElementById('custom-name').value || 'Artículo Vario';
  const price = parseFloat(document.getElementById('custom-price').value) || 0;
  if (price <= 0) {
    alert('Ingrese un precio válido.');
    return;
  }
  cart.push({ id: Date.now(), name, price, quantity: 1 });
  saveCartState();
  renderCart();
  closeCustomItemModal();
}

// ==========================================
// FUNCIONES PARA CREAR NUEVO PRODUCTO
// ==========================================
function openProductModal() {
  document.getElementById('modal-product').classList.remove('hidden');
  document.getElementById('new-prod-name').value = '';
  document.getElementById('new-prod-category').value = '';
  document.getElementById('new-prod-price').value = '';
  document.getElementById('new-prod-stock').value = '';
  document.getElementById('new-prod-barcode').value = '';
}

function closeProductModal() {
  document.getElementById('modal-product').classList.add('hidden');
}

async function saveNewProduct() {
  const name = document.getElementById('new-prod-name').value.trim();
  const category = document.getElementById('new-prod-category').value.trim() || 'General';
  const price = parseFloat(document.getElementById('new-prod-price').value) || 0;
  const stock = parseInt(document.getElementById('new-prod-stock').value) || 0;
  const barcode = document.getElementById('new-prod-barcode').value.trim();

  if (!name || price <= 0) {
    alert('Por favor ingresa un nombre y un precio válido.');
    return;
  }

  // 1. Guardar en la tabla de Supabase
  const { data, error } = await supabaseClient
    .from('products')
    .insert([
      {
        name: name,
        category: category,
        price: price,
        stock: stock,
        barcode: barcode || null,
        icon: 'fa-box'
      }
    ]);

  if (error) {
    console.error('Error al guardar en Supabase:', error);
    alert('⚠️ Error al guardar en Supabase: ' + error.message);
    return;
  }

  // 2. Recargar inventario y cerrar ventana
  closeProductModal();
  await loadProductsFromSupabase();
  alert('✅ ¡Producto guardado en la nube con éxito!');
}

document.getElementById('pay-amount-input')?.addEventListener('input', (e) => {
  const totalText = document.getElementById('modal-total-pay').innerText.replace('Q', '');
  const total = parseFloat(totalText) || 0;
  const paid = parseFloat(e.target.value) || 0;
  const change = paid - total;
  document.getElementById('pay-change-text').innerText = `Q${change >= 0 ? change.toFixed(2) : '0.00'}`;
});

// ==========================================
// MÓDULO DE COBRO GLOBAL Y SEGURO (NO MODIFICAR OTRAS FUNCIONES)
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

  // 1. Descontar stock de forma exacta en Supabase (evita negativos)
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

  // 2. Registrar venta en Supabase
  const { error: saleError } = await supabaseClient
    .from('sales')
    .insert([{ 
      total: total, 
      payment_method: 'Efectivo', 
      items: JSON.stringify(currentCart) 
    }]);

  if (saleError) console.error("Error al registrar la venta:", saleError);

  // 3. Vaciar carrito por completo
  if (typeof cart !== 'undefined') {
    cart.length = 0;
  }

  // 4. Refrescar interfaz del carrito
  if (typeof renderCart === 'function') {
    renderCart();
  }
  
  // 5. Cerrar modal de pago
  const modalPayment = document.getElementById('modal-payment');
  if (modalPayment) modalPayment.classList.add('hidden');

  // 6. Recargar productos desde Supabase para ver el stock actualizado
  if (typeof loadProductsFromSupabase === 'function') {
    await loadProductsFromSupabase();
  }

  alert("✅ ¡Venta realizada con éxito, inventario actualizado y carrito limpio!");
};

// ==========================================
// SUPABASE REALTIME (Actualización en vivo)
// ==========================================
function setupSupabaseRealtime() {
  if (typeof supabaseClient === 'undefined') return;

  supabaseClient
    .channel('public:products')
    .on(
      'postgres_changes',
      {
        event: '*', // Escucha INSERT, UPDATE y DELETE
        schema: 'public',
        table: 'products'
      },
      async (payload) => {
        console.log('🔄 Cambio detectado en Supabase:', payload);
        // Recarga los productos automáticamente en la interfaz sin refrescar la página
        if (typeof loadProductsFromSupabase === 'function') {
          await loadProductsFromSupabase();
        }
      }
    )
    .subscribe();
}

// Ejecutar la función de tiempo real cuando cargue la página
document.addEventListener('DOMContentLoaded', () => {
  setupSupabaseRealtime();
});

window.deleteProduct = async function(productId) {
  if (!confirm("¿Estás seguro de que deseas eliminar este producto del inventario?")) {
    return;
  }

  const { error } = await supabaseClient
    .from('products')
    .delete()
    .eq('id', productId);

  if (error) {
    console.error("Error al eliminar el producto:", error);
    alert("Hubo un error al intentar eliminar el producto.");
  } else {
    alert("🗑️ Producto eliminado con éxito.");
    if (typeof loadProductsFromSupabase === 'function') {
      await loadProductsFromSupabase();
    }
  }
};

window.addStock = async function(productId, currentStock) {
  const input = prompt(`Stock actual: ${currentStock}\n¿Cuántas unidades deseas agregar?:`, "0");
  const quantityToAdd = parseInt(input);

  if (isNaN(quantityToAdd) || quantityToAdd <= 0) {
    return; // Si cancela o ingresa un número inválido, no hace nada
  }

  const newStock = Number(currentStock) + quantityToAdd;

  const { error } = await supabaseClient
    .from('products')
    .update({ stock: newStock })
    .eq('id', productId);

  if (error) {
    console.error("Error al actualizar el stock:", error);
    alert("Error al sumar el stock.");
  } else {
    alert(`✅ ¡Stock actualizado! Nuevo total: ${newStock} unidades.`);
    if (typeof loadProductsFromSupabase === 'function') {
      await loadProductsFromSupabase();
    }
  }
};

// ==========================================
// MÓDULO DE EDICIÓN CON MODAL MINIMALISTA
// ==========================================
window.editProduct = function(productId) {
  const product = products.find(p => String(p.id) === String(productId));
  if (!product) {
    alert("Producto no encontrado.");
    return;
  }

  // Rellenar los inputs del modal con los datos actuales
  document.getElementById('edit-product-id').value = product.id;
  document.getElementById('edit-name').value = product.name || '';
  document.getElementById('edit-category').value = product.category || '';
  document.getElementById('edit-price').value = product.price || 0;
  document.getElementById('edit-barcode').value = product.barcode || '';

  // Mostrar el modal centrado
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
    alert("Por favor completa los campos obligatorios (Nombre y Precio válido).");
    return;
  }

  // 💡 Si el código de barras está vacío, enviamos null para que Supabase no lo tome como duplicado
  const newBarcode = rawBarcode !== "" ? rawBarcode : null;

  // Actualizar en Supabase
  const { error } = await supabaseClient
    .from('products')
    .update({
      name: newName,
      category: newCategory,
      price: newPrice,
      barcode: newBarcode
    })
    .eq('id', productId);

  if (error) {
    console.error("Error al actualizar:", error);
    if (error.code === '23505') {
      alert("⚠️ Error: Este código de barras ya le pertenece a otro producto. Usa uno diferente o déjalo vacío.");
    } else {
      alert("Hubo un error al guardar los cambios.");
    }
  } else {
    closeEditModal();
    if (typeof loadProductsFromSupabase === 'function') {
      await loadProductsFromSupabase();
    }
    alert("✅ ¡Producto actualizado con éxito!");
  }
};

  