import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, deleteDoc, updateDoc, doc, setDoc, serverTimestamp, query, where } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

const CONFIG = {
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyAPiiVfmJdGHje0gittK-7yFTYNTQNY6Fk",
        authDomain: "basjfk-58536.firebaseapp.com",
        projectId: "basjfk-58536",
        storageBucket: "basjfk-58536.firebasestorage.app",
        messagingSenderId: "662162908373",
        appId: "1:662162908373:web:b5a789fd0b6ca6964e2e5c"
    }
};

const app = initializeApp(CONFIG.FIREBASE_CONFIG);
const db = getFirestore(app);
let allProducts = [];

async function bumpDataVersion() {
    try {
        await updateDoc(doc(db, "meta", "version"), {
            updatedAt: Date.now()
        });
    } catch (e) {
        // إذا المستند غير موجود، أنشئه
        try {
            await setDoc(doc(db, "meta", "version"), { updatedAt: Date.now() });
        } catch (err) { console.error(err); }
    }
}

// === إعدادات حالات الطلب الجديدة ===
const ACTIVE_ORDER_STATUSES = ['accepted', 'preparing', 'on_the_way'];
const ORDER_STATUS_LABELS = {
    pending: 'قيد الانتظار',
    accepted: 'تمت الموافقة',
    preparing: 'قيد التجهيز',
    on_the_way: 'في التوصيل'
};

const formatOrderDateTime = (value) => {
    if (!value) return 'غير متوفر';
    let date = null;
    if (typeof value?.toDate === 'function') {
        date = value.toDate();
    } else if (typeof value === 'string' || typeof value === 'number') {
        date = new Date(value);
    } else if (value?.seconds) {
        date = new Date(value.seconds * 1000);
    }
    if (!date || Number.isNaN(date.getTime())) return 'غير متوفر';
    return new Intl.DateTimeFormat('ar-IQ', {
        dateStyle: 'medium',
        timeStyle: 'short'
    }).format(date);
};

const getOrderStatusLabel = (status) => ORDER_STATUS_LABELS[status] || status || 'غير معروف';

const buildOrderActionButtons = (id, status, reloadStatus) => {
    const buttons = [];
    if (status === 'pending') {
        buttons.push(`<button class="btn-action accept" onclick="window.updateOrderStatus('${id}', 'accepted', '${reloadStatus}')">موافقة</button>`);
        buttons.push(`<button class="btn-action edit" onclick="window.updateOrderStatus('${id}', 'preparing', '${reloadStatus}')">قيد التجهيز</button>`);
        buttons.push(`<button class="btn-action edit" onclick="window.updateOrderStatus('${id}', 'on_the_way', '${reloadStatus}')">في التوصيل</button>`);
    } else if (status === 'accepted') {
        buttons.push(`<button class="btn-action edit" onclick="window.updateOrderStatus('${id}', 'preparing', '${reloadStatus}')">قيد التجهيز</button>`);
        buttons.push(`<button class="btn-action edit" onclick="window.updateOrderStatus('${id}', 'on_the_way', '${reloadStatus}')">في التوصيل</button>`);
    } else if (status === 'preparing') {
        buttons.push(`<button class="btn-action edit" onclick="window.updateOrderStatus('${id}', 'on_the_way', '${reloadStatus}')">في التوصيل</button>`);
    }
    buttons.push(`<button class="btn-action delete" onclick="deleteDocItem('orders', '${id}', null, () => window.loadOrders('${reloadStatus}'))">حذف</button>`);
    return buttons.join(' ');
};

// === التنبيهات المنبثقة ===
window.showCustomAlert = (message) => {
    const alertBox = document.createElement('div');
    alertBox.innerHTML = `<i class="fa-solid fa-circle-check" style="font-size: 1.5rem; margin-bottom: 5px;"></i><br>${message}`;
    alertBox.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: rgba(46, 204, 113, 0.95); color: white; padding: 15px 30px;
        border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        z-index: 10000; font-weight: bold; text-align: center; backdrop-filter: blur(5px);
        animation: dropDown 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
    `;
    document.body.appendChild(alertBox);
    if(!document.getElementById('alert-styles')){
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.innerHTML = `
            @keyframes dropDown { 0% { top: -100px; opacity: 0; } 100% { top: 20px; opacity: 1; } }
            @keyframes fadeOutUp { 0% { top: 20px; opacity: 1; } 100% { top: -100px; opacity: 0; } }
        `;
        document.head.appendChild(style);
    }
    setTimeout(() => {
        alertBox.style.animation = 'fadeOutUp 0.5s ease forwards';
        setTimeout(() => alertBox.remove(), 500);
    }, 3000);
};

// === معالجة ورفع الصور ===
async function compressImage(file, maxWidth = 1000, quality = 0.8) {
    if (!file) return null;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let scaleSize = 1;
                if (img.width > maxWidth) scaleSize = maxWidth / img.width;
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
        reader.onerror = error => reject(error);
    });
}

async function uploadToBunny(base64DataUrl) {
    const STORAGE_ZONE_NAME = "2222";
    const ACCESS_KEY = "4777a31f-e6fe-4288-8180acda8543-7590-4b06";
    const PULL_ZONE_URL = "https://tufahat2222.b-cdn.net"; 

    const response = await fetch(base64DataUrl);
    const blob = await response.blob();
    
    const fileName = Date.now() + "_" + Math.floor(Math.random() * 1000) + ".jpg";
    
    const uploadUrl = `https://storage.bunnycdn.com/${STORAGE_ZONE_NAME}/${fileName}`;

    try {
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'AccessKey': ACCESS_KEY,
                'Content-Type': 'application/octet-stream',
            },
            body: blob
        });

        if (uploadResponse.ok) {
            return `${PULL_ZONE_URL}/${fileName}`;
        } else {
            console.error("Bunny.net Error:", await uploadResponse.text());
            return null;
        }
    } catch (error) {
        console.error("Upload Error:", error);
        return null;
    }
}

async function uploadImageGetUrl(file, maxWidth = 1000, quality = 0.8) {
    const compressed = await compressImage(file, maxWidth, quality);
    const url = await uploadToBunny(compressed);
    if (!url) throw new Error('فشل رفع الصورة إلى سيرفرات Bunny.net');
    return url;
}

// === إدارة الدخول والتبويبات ===
window.verifyAdmin = () => {
    const pass = document.getElementById('admin-pass').value;
    if (pass === '1001') {
        document.getElementById('login-overlay').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('login-overlay').style.display = 'none';
            document.getElementById('app-content').style.display = 'flex';
            loadOrders('pending');
        }, 500);
    } else { alert('رمز الدخول غير صحيح!'); }
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const activeNavItem = document.querySelector(`.nav-item[onclick*="switchTab('${tabId}')"]`);
    if (activeNavItem) activeNavItem.classList.add('active');

    if(tabId === 'categories') loadCategories();
    if(tabId === 'products') { loadCategoriesForSelect(); loadProducts(); }
    if(tabId === 'offers') loadOffers();
    if(tabId === 'discount-offers') loadDiscountProducts();
    if(tabId === 'banners') loadBanners();
    if(tabId === 'orders') loadOrders('pending');
    if(tabId === 'accepted-orders') loadOrders('accepted'); // سيعرض كل الطلبات النشطة تلقائياً
    if(tabId === 'sales') loadSales();
};

// === الأقسام ===
window.saveCategory = async () => {
    const id = document.getElementById('cat-id').value;
    const name = document.getElementById('cat-name').value;
    const file = document.getElementById('cat-img').files[0];
    if (!name) return showCustomAlert('أدخل اسم القسم');
    const btn = document.getElementById('btn-save-cat');
    btn.innerText = 'جاري الرفع...';

    try {
        let updateData = { name };
        if (file) {
            updateData.image = await uploadImageGetUrl(file, 400, 0.7);
        }
        if (id) await updateDoc(doc(db, "categories", id), updateData);
        else {
            if (!file) throw new Error('اختر صورة للقسم');
            await addDoc(collection(db, "categories"), { ...updateData, createdAt: serverTimestamp() });
        }
        showCustomAlert('تم حفظ القسم');
        await bumpDataVersion();
        switchTab('categories');
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-img').value = '';
    } catch (e) { showCustomAlert(e.message); }
    btn.innerHTML = 'حفظ القسم <i class="fa-solid fa-save"></i>';
};

window.loadCategories = async () => {
    const list = document.getElementById('categories-list');
    list.innerHTML = 'جاري التحميل...';
    const snapshot = await getDocs(collection(db, "categories"));
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        list.innerHTML += `<div class="card-3d"><img src="${data.image || ''}"><div class="card-title">${data.name}</div><button class="btn-action edit" onclick="editCategory('${docSnap.id}', '${data.name}')">تعديل</button><button class="btn-action delete" onclick="deleteDocItem('categories', '${docSnap.id}', null, loadCategories)">حذف</button></div>`;
    });
};

window.editCategory = (id, name) => {
    document.getElementById('cat-id').value = id;
    document.getElementById('cat-name').value = name;
    document.getElementById('btn-save-cat').innerText = 'تحديث القسم';
};

window.loadCategoriesForSelect = async () => {
    const select = document.getElementById('prod-cat');
    select.innerHTML = '<option value="">اختر القسم</option>';
    const snapshot = await getDocs(collection(db, "categories"));
    snapshot.forEach(docSnap => { select.innerHTML += `<option value="${docSnap.data().name}">${docSnap.data().name}</option>`; });
};

// === المنتجات ===
window.saveProduct = async () => {
    const id = document.getElementById('prod-id').value;
    const name = document.getElementById('prod-name').value;
    const cat = document.getElementById('prod-cat').value;
    const desc = document.getElementById('prod-desc').value;
    const price = document.getElementById('prod-price').value;
    const files = document.getElementById('prod-images').files;

    if (!name || !price) return showCustomAlert('أكمل البيانات');
    const btn = document.getElementById('btn-save-prod');
    btn.innerText = 'جاري الرفع...';

    try {
        let updateData = { name, category: cat, desc, price: Number(price) };

        if (files.length > 0) {
            const url1 = await uploadImageGetUrl(files[0], 800, 0.75);
            updateData.images = [{ id: 'img_' + Date.now(), data: url1 }];
            updateData.image = url1;
            updateData.image1 = url1;

            if (files[1]) {
                const url2 = await uploadImageGetUrl(files[1], 800, 0.75);
                updateData.image2 = url2;
            }
        }

        if (id) await updateDoc(doc(db, "products", id), updateData);
        else await addDoc(collection(db, "products"), { ...updateData, createdAt: serverTimestamp() });

        showCustomAlert('تم حفظ المنتج بنجاح');
        await bumpDataVersion();
        switchTab('products');
        document.getElementById('prod-id').value = '';
        document.getElementById('prod-name').value = '';
        document.getElementById('prod-desc').value = '';
        document.getElementById('prod-price').value = '';
        document.getElementById('prod-images').value = '';
    } catch (e) { showCustomAlert(e.message || 'خطأ في الحفظ'); console.error(e); }
    btn.innerHTML = 'حفظ المنتج <i class="fa-solid fa-save"></i>';
};

window.loadProducts = async () => {
    const list = document.getElementById('products-list');
    list.innerHTML = 'جاري التحميل...';
    const snapshot = await getDocs(collection(db, "products"));
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const imgSrc = (data.images && data.images.length > 0) ? data.images[0].data : (data.image1 || data.image || '');
        list.innerHTML += `<div class="card-3d"><img src="${imgSrc}"><div class="card-title">${data.name}</div><div style="color:#FF6B6B;">${data.price} د.ع</div><button class="btn-action edit" onclick="editProduct('${docSnap.id}', '${data.name}', '${data.category}', '${data.desc}', '${data.price}')">تعديل</button><button class="btn-action delete" onclick="deleteDocItem('products', '${docSnap.id}', null, loadProducts)">حذف</button></div>`;
    });
};

window.editProduct = (id, name, cat, desc, price) => {
    document.getElementById('prod-id').value = id;
    document.getElementById('prod-name').value = name;
    document.getElementById('prod-cat').value = cat;
    document.getElementById('prod-desc').value = desc;
    document.getElementById('prod-price').value = price;
    document.getElementById('btn-save-prod').innerText = 'تحديث المنتج';
    window.scrollTo(0, 0);
};

// === الخصومات ===
window.loadDiscountProducts = async () => {
    const selectList = document.getElementById('discount-products-select-list');
    const discountList = document.getElementById('discounted-products-list');
    selectList.innerHTML = 'جاري التحميل...';
    discountList.innerHTML = '';
    const snapshot = await getDocs(collection(db, "products"));
    allProducts = [];
    selectList.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        allProducts.push({ id: docSnap.id, ...data });
        const imgSrc = (data.images && data.images.length > 0) ? data.images[0].data : (data.image1 || '');
        if (!data.hasDiscount) {
            selectList.innerHTML += `<div class="card-3d" style="padding:10px;"><input type="checkbox" class="discount-checkbox" value="${docSnap.id}"><img src="${imgSrc}" style="height:80px;"><div style="font-size:0.9rem;">${data.name}</div></div>`;
        } else {
            discountList.innerHTML += `<div class="card-3d"><img src="${imgSrc}"><div class="card-title">${data.name}</div><div style="text-decoration:line-through; color:#999;">${data.originalPrice} د.ع</div><div style="color:#2ecc71;">${data.price} د.ع (-${data.discountPercent}%)</div><button class="btn-action remove-discount" onclick="removeDiscount('${docSnap.id}', ${data.originalPrice})">إلغاء الخصم</button></div>`;
        }
    });
};

window.applyDiscountToSelected = async () => {
    const percent = document.getElementById('discount-percent').value;
    const checkboxes = document.querySelectorAll('.discount-checkbox:checked');
    if (!percent || checkboxes.length === 0) return showCustomAlert('أكمل بيانات الخصم');
    for (let cb of checkboxes) {
        const product = allProducts.find(p => p.id === cb.value);
        if (product) {
            const originalPrice = product.price;
            const newPrice = Math.round(originalPrice - (originalPrice * (percent / 100)));
            await updateDoc(doc(db, "products", product.id), { price: newPrice, originalPrice: originalPrice, hasDiscount: true, discountPercent: percent });
        }
    }
    showCustomAlert('تم تطبيق الخصم');
    await bumpDataVersion();
    loadDiscountProducts();
};

window.removeDiscount = async (id, originalPrice) => {
    await updateDoc(doc(db, "products", id), { price: originalPrice, originalPrice: null, hasDiscount: false, discountPercent: null });
    await bumpDataVersion();
    loadDiscountProducts();
};

// === العروض والبنرات ===
window.saveOffer = async () => {
    const files = document.getElementById('offer-img').files;
    const btn = document.getElementById('btn-save-offer');
    btn.innerText = 'جاري الرفع...';
    try {
        for(let f of files) {
            const url = await uploadImageGetUrl(f, 900, 0.75);
            await addDoc(collection(db, "offers"), { image: url, createdAt: serverTimestamp() });
        }
        showCustomAlert('تم حفظ العروض');
        await bumpDataVersion();
        loadOffers();
    } catch(e) { showCustomAlert(e.message); }
    btn.innerHTML = 'حفظ العرض <i class="fa-solid fa-save"></i>';
};

window.loadOffers = async () => {
    const list = document.getElementById('offers-list');
    const snapshot = await getDocs(collection(db, "offers"));
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        list.innerHTML += `<div class="card-3d"><img src="${docSnap.data().image}"><button class="btn-action delete" onclick="deleteDocItem('offers', '${docSnap.id}', null, loadOffers)">حذف</button></div>`;
    });
};

window.saveBanner = async () => {
    const files = document.getElementById('banner-img').files;
    const btn = document.getElementById('btn-save-banner');
    btn.innerText = 'جاري الرفع...';
    try {
        for(let f of files) {
            const url = await uploadImageGetUrl(f, 1200, 0.8);
            await addDoc(collection(db, "banners"), { image: url, createdAt: serverTimestamp() });
        }
        showCustomAlert('تم حفظ البنرات');
        await bumpDataVersion();
        loadBanners();
    } catch(e) { showCustomAlert(e.message); }
    btn.innerHTML = 'حفظ البنر <i class="fa-solid fa-save"></i>';
};

window.loadBanners = async () => {
    const list = document.getElementById('banners-list');
    const snapshot = await getDocs(collection(db, "banners"));
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        list.innerHTML += `<div class="card-3d"><img src="${docSnap.data().image}"><button class="btn-action delete" onclick="deleteDocItem('banners', '${docSnap.id}', null, loadBanners)">حذف</button></div>`;
    });
};

// === إدارة الطلبات والمبيعات (محدثة) ===
window.loadOrders = async (status) => {
    const list = document.getElementById(status === 'pending' ? 'orders-list' : 'accepted-orders-list');
    const q = status === 'pending'
        ? query(collection(db, "orders"), where("status", "==", "pending"))
        : query(collection(db, "orders"), where("status", "in", ACTIVE_ORDER_STATUSES));

    const snapshot = await getDocs(q);
    list.innerHTML = '';
    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let itemsHtml = '';
        data.items?.forEach(item => {
            itemsHtml += `<div style="display:flex; gap:10px; margin-bottom:5px;"><img src="${item.image}" style="width:40px;height:40px;border-radius:5px;"><span>${item.name} (${item.qty})</span></div>`;
        });

        const createdAtHtml = `<div><strong>تاريخ الطلب:</strong> ${formatOrderDateTime(data.createdAt)}</div>`;
        const updatedAtHtml = data.statusUpdatedAt ? `<div><strong>آخر تحديث:</strong> ${formatOrderDateTime(data.statusUpdatedAt)}</div>` : '';
        
        const addressValue = data.address || data.Address || data.location || data.Location;
        const addressHtml = addressValue ? `<div><strong>العنوان:</strong> ${addressValue}</div>` : `<div><strong>العنوان:</strong> غير متوفر</div>`;
        
        const statusHtml = `<div><strong>الحالة:</strong> ${getOrderStatusLabel(data.status)}</div>`;

        list.innerHTML += `<div class="card-3d" style="text-align:right;">
            <div><strong>الاسم:</strong> ${data.name}</div>
            <div><strong>الهاتف:</strong> ${data.phone}</div>
            ${addressHtml}
            ${statusHtml}
            ${createdAtHtml}
            ${updatedAtHtml}
            <div style="margin:10px 0;">${itemsHtml}</div>
            <div style="color:#FF6B6B;">الإجمالي: ${data.total} د.ع</div>
            <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                ${buildOrderActionButtons(docSnap.id, data.status, status)}
            </div>
        </div>`;
    });
};

window.updateOrderStatus = async (id, nextStatus, reloadStatus = 'accepted') => {
    await updateDoc(doc(db, "orders", id), {
        status: nextStatus,
        statusUpdatedAt: serverTimestamp()
    });
    window.showCustomAlert(`تم تغيير الحالة إلى: ${getOrderStatusLabel(nextStatus)}`);
    window.loadOrders(reloadStatus);
};

window.acceptOrder = async (id) => {
    await window.updateOrderStatus(id, 'accepted', 'pending');
};

window.loadSales = async () => {
    const list = document.getElementById('sales-list');
    // جلب كل الطلبات النشطة (مقبولة، قيد التجهيز، في التوصيل) لحساب المبيعات بدقة
    const q = query(collection(db, "orders"), where("status", "in", ACTIVE_ORDER_STATUSES));
    const snapshot = await getDocs(q);
    let total = 0;
    snapshot.forEach(docSnap => { total += docSnap.data().total || 0; });
    list.innerHTML = `<div class="card-3d" style="background:#2ecc71; color:white;"><h3>إجمالي المبيعات</h3><h2>${total} د.ع</h2></div>`;
};

window.resetSales = async () => {
    if(!confirm('هل أنت متأكد من تصفير المبيعات وحذف كل الطلبات المقبولة والنشطة؟')) return;
    const q = query(collection(db, "orders"), where("status", "in", ACTIVE_ORDER_STATUSES));
    const snapshot = await getDocs(q);
    snapshot.forEach(async d => await deleteDoc(doc(db, "orders", d.id)));
    loadSales();
};

window.deleteDocItem = async (col, id, unused, cb) => {
    if(!confirm('متأكد من الحذف؟')) return;
    await deleteDoc(doc(db, col, id));
    await bumpDataVersion();
    if(cb) cb();
};
