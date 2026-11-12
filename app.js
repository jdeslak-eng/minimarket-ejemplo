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
let cart = JSON.parse(localStorage.getItem('pos_cart')) || [];

function saveCartState() {
  localStorage.setItem('pos_cart', JSON.stringify(cart));
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
  cargarHistorialVentas();
  setupSupabaseRealtime();
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
// GESTIÓN DEL CARRITO (CON EDICIÓN DE CANTIDAD)
// ==========================================
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (product.stock <= 0) {
    alert('¡Sin stock disponible para este producto!');
    return;
  }

  const existingItem = cart.find(item => String(item.id) === String(productId));
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
      const itemSubtotal = item.price * item.quantity;
      subtotal += itemSubtotal;

      container.innerHTML += `
        <div class="flex justify-between items-center py-2.5 border-b border-stone-100 text-xs">
          <div class="flex-1 pr-2">
            <p class="font-bold text-stone-800 line-clamp-1">${item.name}</p>
            <p class="text-stone-500">Q ${item.price.toFixed(2)} c/u</p>
          </div>

          <!-- CONTROLES DE CANTIDAD (- / INPUT / +) -->
          <div class="flex items-center gap-1 mr-3">
            <button onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})" class="w-6 h-6 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold flex items-center justify-center transition">-</button>
            
            <input type="number" min="1" max="${item.stock}" value="${item.quantity}" 
              onchange="updateCartQuantity('${item.id}', this.value)"
              class="w-12 text-center font-bold border border-stone-300 rounded py-0.5 text-xs focus:outline-none focus:border-stone-900">
            
            <button onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})" class="w-6 h-6 rounded bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold flex items-center justify-center transition">+</button>
          </div>

          <!-- SUBTOTAL Y BOTÓN ELIMINAR -->
          <div class="flex items-center gap-2">
            <span class="font-extrabold text-stone-900 w-16 text-right">Q ${itemSubtotal.toFixed(2)}</span>
            <button onclick="removeFromCart('${item.id}')" class="text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
    });
  }

  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl = document.getElementById('cart-total');
  if (subtotalEl) subtotalEl.innerText = `Q ${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.innerText = `Q ${subtotal.toFixed(2)}`;
}

window.updateCartQuantity = function(productId, newQty) {
  const qty = parseInt(newQty);
  const item = cart.find(i => String(i.id) === String(productId));
  
  if (!item) return;

  if (isNaN(qty) || qty <= 0) {
    removeFromCart(productId);
    return;
  }

  if (qty > item.stock) {
    alert(`Solo hay ${item.stock} unidades disponibles en stock.`);
    item.quantity = item.stock;
  } else {
    item.quantity = qty;
  }

  saveCartState();
  renderCart();
};

function removeFromCart(productId) {
  cart = cart.filter(item => String(item.id) !== String(productId));
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

  if (tabId === 'cash' && typeof updateCashCutView === 'function') updateCashCutView();
  
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

window.setPaymentMethod = function(method) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => btn.classList.remove('active'));
  const btnEl = document.getElementById(`pay-${method}`);
  if (btnEl) btnEl.classList.add('active');

  const calc = document.getElementById('cash-calculator');
  if (calc) {
    if (method === 'cash') {
      calc.classList.remove('hidden');
    } else {
      calc.classList.add('hidden');
    }
  }
};

// ==========================================
// HISTORIAL DETALLADO AGRUPADO POR FECHA
// ==========================================
async function cargarHistorialVentas() {
  const tbody = document.getElementById('sales-table-body');
  const totalDayEl = document.getElementById('sales-total-day');
  
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-4 text-stone-500">Cargando historial detallado...</td>
    </tr>
  `;

  const { data: ventas, error } = await supabaseClient
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al obtener ventas:', error.message);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-red-500">Error al cargar el historial</td>
      </tr>
    `;
    return;
  }

  if (!ventas || ventas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-stone-500">No hay ventas registradas todavía.</td>
      </tr>
    `;
    if (totalDayEl) totalDayEl.textContent = 'Q 0.00';
    return;
  }

  const ventasAgrupadasPorFecha = {};
  let totalGlobalAcumulado = 0;

  ventas.forEach(venta => {
    const monto = Number(venta.total || 0);
    totalGlobalAcumulado += monto;

    const fechaObj = new Date(venta.created_at);
    const fechaKey = fechaObj.toLocaleDateString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    if (!ventasAgrupadasPorFecha[fechaKey]) {
      ventasAgrupadasPorFecha[fechaKey] = {
        fecha: fechaKey,
        ventasDelDia: [],
        totalDia: 0
      };
    }

    ventasAgrupadasPorFecha[fechaKey].ventasDelDia.push(venta);
    ventasAgrupadasPorFecha[fechaKey].totalDia += monto;
  });

  tbody.innerHTML = '';

  Object.values(ventasAgrupadasPorFecha).forEach(grupo => {
    tbody.innerHTML += `
      <tr class="bg-stone-100 font-bold text-stone-700">
        <td colspan="6" class="py-2.5 px-3">📅 Fecha: ${grupo.fecha}</td>
        <td class="py-2.5 px-3 text-right">Total Día: Q ${grupo.totalDia.toFixed(2)}</td>
      </tr>
    `;

    grupo.ventasDelDia.forEach(venta => {
      const hora = new Date(venta.created_at).toLocaleTimeString('es-GT', {
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

      const ventaJson = JSON.stringify(venta).replace(/"/g, '"');
      const cajeroEmail = venta.user_email || 'General';

      tbody.innerHTML += `
        <tr class="border-b border-stone-100 text-xs hover:bg-stone-50 transition">
          <td class="py-2.5 pl-6 font-bold text-stone-800">#${venta.id}</td>
          <td class="text-stone-500">${hora}</td>
          <td><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">${cajeroEmail}</span></td>
          <td><span class="px-2 py-0.5 bg-stone-100 rounded text-[10px] font-medium uppercase">${venta.payment_method || 'Efectivo'}</span></td>
          <td class="text-stone-600">${resumenItems}</td>
          <td class="text-right font-extrabold text-stone-900">Q ${Number(venta.total).toFixed(2)}</td>
          <td class="text-right pr-4 flex items-center justify-end gap-1.5 py-2.5">
            <button onclick='reimprimirTicket(${ventaJson})' title="Reimprimir Ticket" class="bg-stone-800 hover:bg-stone-900 text-white px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1">
              <i class="fa-solid fa-print"></i>
            </button>
            <button onclick="procesarDevolucion(${venta.id})" title="Devolución / Anular Venta" class="bg-rose-600 hover:bg-rose-700 text-white px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1">
              <i class="fa-solid fa-rotate-left"></i> Dev.
            </button>
          </td>
        </tr>
      `;
    });
  });

  if (totalDayEl) {
    totalDayEl.textContent = `Q ${totalGlobalAcumulado.toFixed(2)}`;
  }
}

// ==========================================
// MÓDULO DE COBRO GLOBAL Y SEGURO (UNIFICADO)
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
  const cambio = payAmount - total;

  if (payAmount < total) {
    alert("El monto ingresado es menor al total a pagar.");
    return;
  }

  // 0. Obtener el correo del usuario/cajero logueado actualmente
  const { data: { user } } = await supabaseClient.auth.getUser();
  const userEmail = user ? user.email : 'desconocido';

  // 1. Descontar stock en Supabase
  for (const item of currentCart) {
    const stockActual = Number(item.stock) || 0;
    const cantidadVendida = Number(item.quantity || 1);
    const nuevoStock = stockActual - cantidadVendida;

    const { error } = await supabaseClient
      .from('products')
      .update({ stock: Math.max(0, nuevoStock) })
      .eq('id', item.id);

    if (error) console.error(`Error al actualizar stock de ${item.name}:`, error);
  }

  // 2. Registrar venta en Supabase (tabla 'sales') con el user_email incluido
  const { data: insertedSale, error: saleError } = await supabaseClient
    .from('sales')
    .insert([{ 
      total: total, 
      payment_method: selectedPaymentMethod || 'Efectivo', 
      items: currentCart,
      user_email: userEmail 
    }])
    .select();

  if (saleError) {
    console.error("Error al registrar la venta:", saleError);
    alert("⚠️ Ocurrió un error al guardar la venta en la nube.");
    return;
  }

  // 3. Preparar datos del ticket
  const saleDetails = {
    id: insertedSale && insertedSale[0] ? insertedSale[0].id : Math.floor(1000 + Math.random() * 9000),
    fecha: new Date().toLocaleString('es-GT'),
    items: [...currentCart],
    total: total,
    pago: payAmount,
    cambio: cambio,
    metodo: selectedPaymentMethod || 'Efectivo',
    cajero: userEmail
  };

  // 4. Vaciar carrito local
  cart = [];
  saveCartState();
  renderCart();
  
  // 5. Cerrar modal de pago
  const modalPayment = document.getElementById('modal-payment');
  if (modalPayment) modalPayment.classList.add('hidden');

  // 6. Actualizar inventario e historial en pantalla
  await loadProductsFromSupabase();
  await cargarHistorialVentas();

  // 7. ABRIR EL MODAL DEL TICKET
  if (typeof renderAndShowTicket === 'function') {
    renderAndShowTicket(saleDetails);
  } else {
    alert(`✅ ¡Venta #${saleDetails.id} realizada con éxito!`);
  }
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
      async () => {
        if (typeof loadProductsFromSupabase === 'function') {
          await loadProductsFromSupabase();
        }
      }
    )
    .subscribe();
}

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

// ==========================================
// MÓDULO DE GENERACIÓN Y VISUALIZACIÓN DE TICKET
// ==========================================
function renderAndShowTicket(sale) {
  const modalTicket = document.getElementById('modal-ticket');
  const ticketContent = document.getElementById('ticket-content');

  if (!modalTicket || !ticketContent) {
    console.warn("⚠️ No se encontró el elemento modal-ticket en el HTML.");
    return;
  }

  const itemsHtml = sale.items.map(item => {
    const nombre = item.name || item.nombre || 'Producto';
    const cant = item.quantity || item.cantidad || 1;
    const precio = Number(item.price || item.precio || 0);
    const subtotal = precio * cant;

    return `
      <div class="flex justify-between py-0.5">
        <span>${nombre} x${cant}</span>
        <span>Q ${subtotal.toFixed(2)}</span>
      </div>
    `;
  }).join('');

  ticketContent.innerHTML = `
    <div class="text-center mb-3">
      <h4 class="font-extrabold text-sm tracking-wider uppercase text-stone-900">minimarket</h4>
      <p class="text-[10px] text-stone-500">supero 24 horas</p>
      <p class="text-[10px] text-stone-400">${sale.fecha}</p>
      <p class="text-[10px] font-bold text-stone-700 mt-1">Ticket #${sale.id}</p>
    </div>

    <div class="border-t border-b border-dashed border-stone-300 py-2 my-2">
      ${itemsHtml}
    </div>

    <div class="space-y-1 font-bold text-stone-900 pt-1">
      <div class="flex justify-between text-sm">
        <span>TOTAL:</span>
        <span>Q ${sale.total.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-[11px] font-normal text-stone-600">
        <span>PAGADO:</span>
        <span>Q ${sale.pago.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-[11px] font-normal text-stone-600">
        <span>CAMBIO:</span>
        <span>Q ${sale.cambio.toFixed(2)}</span>
      </div>
    </div>

    <div class="text-center mt-4 pt-2 border-t border-dashed border-stone-300 text-[10px] text-stone-500">
      <p>¡Gracias por su compra!</p>
    </div>
  `;

  modalTicket.classList.remove('hidden');
}

function closeTicketModal() {
  const modalTicket = document.getElementById('modal-ticket');
  if (modalTicket) modalTicket.classList.add('hidden');
}

// ==========================================
// REIMPRIMIR TICKET DESDE EL HISTORIAL
// ==========================================
window.reimprimirTicket = function(venta) {
  let itemsArray = venta.items;
  if (typeof itemsArray === 'string') {
    try { itemsArray = JSON.parse(itemsArray); } catch (e) { itemsArray = []; }
  }

  const fechaFormateada = new Date(venta.created_at).toLocaleString('es-GT');

  const saleDetails = {
    id: venta.id,
    fecha: fechaFormateada,
    items: itemsArray,
    total: Number(venta.total || 0),
    pago: Number(venta.total || 0),
    cambio: 0,
    metodo: venta.payment_method || 'Efectivo'
  };

  if (typeof renderAndShowTicket === 'function') {
    renderAndShowTicket(saleDetails);
  } else {
    alert("⚠️ El módulo de visualización de tickets no está disponible.");
  }
};

// ==========================================
// MÓDULO DE DEVOLUCIÓN Y ANULACIÓN DE VENTAS
// ==========================================
window.procesarDevolucion = async function(ventaId) {
  if (!confirm(`⚠️ ¿Estás seguro de realizar la DEVOLUCIÓN de la venta #${ventaId}?\n\nEsto devolverá los productos al inventario y eliminará el registro de la venta.`)) {
    return;
  }

  const { data: ventaData, error: fetchError } = await supabaseClient
    .from('sales')
    .select('*')
    .eq('id', ventaId)
    .single();

  if (fetchError || !ventaData) {
    alert("❌ No se pudo encontrar la información de la venta.");
    return;
  }

  let itemsArray = ventaData.items;
  if (typeof itemsArray === 'string') {
    try { itemsArray = JSON.parse(itemsArray); } catch (e) { itemsArray = []; }
  }

  if (Array.isArray(itemsArray)) {
    for (const item of itemsArray) {
      const prodId = item.id;
      const cantidadDevuelta = Number(item.quantity || item.cantidad || 1);

      const { data: prodData, error: prodError } = await supabaseClient
        .from('products')
        .select('stock')
        .eq('id', prodId)
        .single();

      if (!prodError && prodData) {
        const stockActual = Number(prodData.stock || 0);
        const nuevoStock = stockActual + cantidadDevuelta;

        await supabaseClient
          .from('products')
          .update({ stock: nuevoStock })
          .eq('id', prodId);
      }
    }
  }

  const { error: deleteError } = await supabaseClient
    .from('sales')
    .delete()
    .eq('id', ventaId);

  if (deleteError) {
    alert("⚠️ Hubo un error al eliminar la venta de la base de datos.");
  } else {
    alert(`✅ ¡Devolución de la venta #${ventaId} procesada con éxito!\nEl inventario ha sido restaurado.`);
    await loadProductsFromSupabase();
    await cargarHistorialVentas();
  }
};

// ==========================================
// FUNCIONES ADICIONALES (PRODUCTO MANUAL)
// ==========================================
window.openCustomItemModal = function() {
  const nombre = prompt("Nombre del producto o servicio libre:");
  if (!nombre || nombre.trim() === "") return;

  const precioInput = prompt(`Precio para "${nombre}":`, "0.00");
  const precio = parseFloat(precioInput);

  if (isNaN(precio) || precio <= 0) {
    alert("Precio no válido.");
    return;
  }

  cart.push({
    id: 'custom_' + Date.now(),
    name: nombre.trim(),
    price: precio,
    stock: 9999,
    quantity: 1
  });

  saveCartState();
  renderCart();
};

// ==========================================
// MÓDULO DE CORTE DE CAJA / INGRESOS
// ==========================================
async function updateCashCutView() {
  const efectivoEl = document.getElementById('cash-sales-total');
  const tarjetaEl = document.getElementById('digital-sales-total');
  const totalEl = document.getElementById('overall-sales-total');

  const { data: ventas, error } = await supabaseClient
    .from('sales')
    .select('*');

  if (error) {
    console.error("Error al obtener ventas para el corte de caja:", error);
    return;
  }

  let totalEfectivo = 0;
  let totalTarjeta = 0;

  if (ventas && ventas.length > 0) {
    ventas.forEach(venta => {
      const monto = Number(venta.total || 0);
      const metodo = (venta.payment_method || 'cash').toLowerCase();

      if (metodo.includes('efectivo') || metodo === 'cash') {
        totalEfectivo += monto;
      } else {
        totalTarjeta += monto;
      }
    });
  }

  const totalGeneral = totalEfectivo + totalTarjeta;

  if (efectivoEl) efectivoEl.innerText = `Q ${totalEfectivo.toFixed(2)}`;
  if (tarjetaEl) tarjetaEl.innerText = `Q ${totalTarjeta.toFixed(2)}`;
  if (totalEl) totalEl.innerText = `Q ${totalGeneral.toFixed(2)}`;
}

// ==========================================
// REINICIAR Y GUARDAR CIERRE (NUEVO DÍA + CIERRE GLOBAL)
// ==========================================
window.startNewDay = async function() {
  if (!confirm("⚠️ ¿Estás seguro de realizar el Corte de Caja y comenzar un NUEVO DÍA?\n\nEsto limpiará las ventas actuales, dejará el corte en cero y cerrará la sesión globalmente por seguridad.")) {
    return;
  }

  try {
    const { data: ventasActuales, error: fetchError } = await supabaseClient
      .from('sales')
      .select('id');

    if (fetchError) {
      console.error("Error al consultar ventas:", fetchError);
      alert("❌ Error al consultar las ventas para el corte.");
      return;
    }

    if (ventasActuales && ventasActuales.length > 0) {
      for (const venta of ventasActuales) {
        await supabaseClient
          .from('sales')
          .delete()
          .eq('id', venta.id);
      }
    }

    alert("✅ ¡Corte de caja realizado con éxito! La caja se ha reiniciado a Q 0.00 y se cerrará la sesión en todas partes.");

  } catch (err) {
    console.error("Error en startNewDay:", err);
  } finally {
    // Cierre global para desconectar todas las terminales que usen la misma cuenta
    await supabaseClient.auth.signOut({ scope: 'global' });
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload(true);
  }
};