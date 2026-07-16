/**
 * Web Dusun Dangkel Kulon - Main Application Logic
 * Integrasi Supabase, Google Auth, Leaflet.js Map, dan Chart.js
 */

// 1. SUPABASE CONFIGURATION (FALLBACK KE LOCAL STORAGE UNTUK MEMUDAHKAN DEPLOYMENT/PENGUJIAN LOKAL)
let SUPABASE_URL = localStorage.getItem('SB_URL') || '';
let SUPABASE_KEY = localStorage.getItem('SB_KEY') || '';

let supabase = null;

// Inisialisasi Supabase Client jika kredensial tersedia
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (error) {
    console.error('Gagal menginisialisasi Supabase Client:', error);
  }
}

// 2. RUNTIME STATE
let currentUser = null;
let userProfile = null;
let leafletMap = null;
let umkmMarkers = [];
let defaultCoordinates = [-7.3683, 110.3340]; // Koordinat perkiraan Grabag, Magelang / Jateng

// 3. DOCUMENT READY HANDLER
document.addEventListener('DOMContentLoaded', async () => {
  // Mobile Nav Burger Menu
  setupMobileNav();

  // Setup panel konfigurasi Supabase (hanya untuk pengujian lokal jika kredensial kosong)
  setupConfigPanel();

  // Inisialisasi Supabase & Cek Status Login
  if (supabase) {
    await checkAuth();
  } else {
    showConfigBanner();
  }

  // Deteksi Halaman Aktif & Jalankan Inisialisasi Spesifik Halaman
  const path = window.location.pathname;
  if (path.includes('dashboard.html')) {
    if (supabase) {
      await initDashboard();
    } else {
      window.location.href = 'index.html';
    }
  } else {
    // Halaman Publik (index.html)
    initPublicPage();
  }
});

// ==========================================
// FASE 1: AUTHENTICATION & LOGIN LOGIC
// ==========================================

async function checkAuth() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (session) {
      currentUser = session.user;
      
      // Ambil data profil tambahan dari public.profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();
      
      if (profileError) {
        console.warn('Profil belum terbuat otomatis:', profileError);
      } else {
        userProfile = profile;
        updateUIForLoggedInUser();
      }
    } else {
      currentUser = null;
      userProfile = null;
    }
  } catch (err) {
    console.error('Error saat memeriksa status login:', err.message);
  }
}

function updateUIForLoggedInUser() {
  // Update tombol Login di navbar halaman utama menjadi tombol Dashboard
  const loginNavBtn = document.getElementById('login-nav-btn');
  if (loginNavBtn && userProfile) {
    if (userProfile.status === 'approved') {
      loginNavBtn.outerHTML = `
        <a href="dashboard.html" class="btn btn-primary" id="login-nav-btn">
          <i class="fas fa-columns"></i> Dashboard Admin
        </a>
      `;
    } else {
      loginNavBtn.outerHTML = `
        <a href="dashboard.html" class="btn btn-secondary" id="login-nav-btn" style="background-color: var(--warning); color: var(--dark)">
          <i class="fas fa-hourglass-half"></i> Menunggu ACC
        </a>
      `;
    }
  }
}

async function loginWithGoogle() {
  if (!supabase) {
    showToast('Harap konfigurasikan API Supabase terlebih dahulu di bagian bawah halaman!', 'error');
    return;
  }
  
  // URL tujuan setelah login berhasil dialihkan
  const redirectUrl = window.location.origin + window.location.pathname.replace('index.html', '').replace('dashboard.html', '') + 'dashboard.html';
  
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl
    }
  });

  if (error) {
    showToast('Gagal melakukan otentikasi Google: ' + error.message, 'error');
  }
}

async function logout() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    showToast('Gagal logout: ' + error.message, 'error');
  } else {
    localStorage.removeItem('supabase.auth.token');
    showToast('Berhasil keluar!', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1000);
  }
}

// ==========================================
// FASE 2: PUBLIC SITE CONTENT LOADER (INDEX)
// ==========================================

function initPublicPage() {
  // Inisialisasi Peta Leaflet
  initMap();

  // Load Berita & UMKM
  if (supabase) {
    loadPublicNews();
    loadPublicUMKM();
  } else {
    loadMockNews();
    loadMockUMKM();
  }

  // Load Statistik Penduduk
  initStatsChart();

  // Setup Form Kontak
  setupContactForm();
}

function initMap() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  // Inisialisasi Peta mengarah ke koordinat Dusun Dangkel Kulon
  leafletMap = L.map('map').setView(defaultCoordinates, 15);

  // Gunakan layer OpenStreetMap dengan desain elegan
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(leafletMap);

  // Marker default Kantor Dusun
  const homeIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/8030/8030147.png', // Ikon rumah/balai dusun
    iconSize: [38, 38],
    iconAnchor: [19, 38]
  });

  L.marker(defaultCoordinates, { icon: homeIcon })
    .addTo(leafletMap)
    .bindPopup('<b>Kantor Dusun Dangkel Kulon</b><br>Pusat Pelayanan Warga Dangkel Kulon.')
    .openPopup();
}

async function loadPublicNews() {
  const container = document.getElementById('news-container');
  if (!container) return;

  container.innerHTML = '<div class="text-center" style="grid-column: 1/-1;"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><p>Memuat Berita...</p></div>';

  try {
    const { data: newsList, error } = await supabase
      .from('news')
      .select(`
        *,
        author:profiles(full_name, avatar_url)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    container.innerHTML = '';
    if (newsList.length === 0) {
      container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1/-1;">Belum ada berita kegiatan pemuda saat ini.</p>';
      return;
    }

    newsList.forEach(news => {
      const card = createNewsCard(news);
      container.appendChild(card);
    });
  } catch (err) {
    console.error('Gagal mengambil berita:', err.message);
    loadMockNews();
  }
}

function createNewsCard(news) {
  const card = document.createElement('div');
  card.className = 'news-card';
  
  const formattedDate = new Date(news.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const authorName = news.author?.full_name || 'Admin Dusun';
  const authorAvatar = news.author?.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
  const image = news.image_url || 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80';

  card.innerHTML = `
    <div class="news-image">
      <img src="${image}" alt="${news.title}" onerror="this.src='https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80'">
      <span class="news-badge">Kegiatan Pemuda</span>
    </div>
    <div class="news-content">
      <div class="news-meta">
        <span><i class="far fa-calendar"></i> ${formattedDate}</span>
      </div>
      <h3 class="news-title">${escapeHTML(news.title)}</h3>
      <p class="news-excerpt">${escapeHTML(news.content)}</p>
      <div class="news-footer">
        <div class="author-info">
          <img src="${authorAvatar}" alt="${authorName}">
          <span>${escapeHTML(authorName)}</span>
        </div>
        <a href="#" class="read-more-link" onclick="openNewsModal(${JSON.stringify(news).replace(/"/g, '&quot;')}); return false;">Baca Selengkapnya <i class="fas fa-arrow-right"></i></a>
      </div>
    </div>
  `;
  return card;
}

function openNewsModal(news) {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'news-reader-modal';

  const formattedDate = new Date(news.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const authorName = news.author?.full_name || 'Admin Dusun';
  const authorAvatar = news.author?.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
  const image = news.image_url || 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80';

  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeReaderModal()"></div>
    <div class="modal-container" style="max-width: 750px;">
      <div class="modal-header">
        <h3>Detail Berita & Kegiatan</h3>
        <button class="modal-close" onclick="closeReaderModal()">&times;</button>
      </div>
      <div class="modal-body" style="line-height: 1.8;">
        <img src="${image}" alt="${news.title}" style="width:100%; max-height:350px; object-fit:cover; border-radius:12px; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; font-size:0.85rem; color:var(--gray-600); border-bottom: 1px solid var(--gray-200); padding-bottom:15px;">
          <div class="author-info">
            <img src="${authorAvatar}" alt="${authorName}">
            <strong>${escapeHTML(authorName)}</strong>
          </div>
          <span><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
        </div>
        <h2 style="font-size:2rem; margin-bottom:15px; color:var(--dark);">${escapeHTML(news.title)}</h2>
        <div style="white-space: pre-wrap; font-size:1.05rem; color:var(--gray-800);">${escapeHTML(news.content)}</div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeReaderModal() {
  const modal = document.getElementById('news-reader-modal');
  if (modal) modal.remove();
}

async function loadPublicUMKM() {
  const container = document.getElementById('umkm-container');
  if (!container) return;

  container.innerHTML = '<div class="text-center" style="grid-column: 1/-1;"><i class="fas fa-spinner fa-spin fa-2x text-primary"></i><p>Memuat UMKM...</p></div>';

  try {
    const { data: umkmList, error } = await supabase
      .from('umkm')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    window.allUmkmList = umkmList; // Simpan untuk pencarian & filter
    renderUMKM(umkmList);
    addUMKMMarkers(umkmList);
  } catch (err) {
    console.error('Gagal mengambil UMKM:', err.message);
    loadMockUMKM();
  }
}

function renderUMKM(list) {
  const container = document.getElementById('umkm-container');
  if (!container) return;

  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1/-1;">Tidak ada UMKM yang cocok dengan filter pencarian.</p>';
    return;
  }

  list.forEach(umkm => {
    const card = document.createElement('div');
    card.className = 'umkm-card';
    
    const waLink = `https://wa.me/${formatPhoneNumber(umkm.whatsapp_number)}?text=Halo%20${encodeURIComponent(umkm.name)},%20saya%20tertarik%20dengan%20produk%20Anda%20dari%20web%20Dusun.`;
    const image = umkm.image_url || 'https://images.unsplash.com/photo-1473187983305-f615310e7daa?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80';

    card.innerHTML = `
      <div class="umkm-image">
        <img src="${image}" alt="${umkm.name}" onerror="this.src='https://images.unsplash.com/photo-1473187983305-f615310e7daa?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'">
        <span class="umkm-category">${escapeHTML(umkm.category)}</span>
      </div>
      <div class="umkm-content">
        <h3 class="umkm-title">${escapeHTML(umkm.name)}</h3>
        <div class="umkm-owner">Pemilik: ${escapeHTML(umkm.owner)}</div>
        <p class="umkm-desc">${escapeHTML(umkm.description || '')}</p>
        <div class="umkm-contact">
          <span class="umkm-address"><i class="fas fa-map-marker-alt text-primary"></i> ${escapeHTML(umkm.address)}</span>
          <a href="${waLink}" target="_blank" class="btn btn-whatsapp">
            <i class="fab fa-whatsapp"></i> Hubungi
          </a>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function addUMKMMarkers(list) {
  if (!leafletMap) return;

  // Hapus marker lama
  umkmMarkers.forEach(m => leafletMap.removeLayer(m));
  umkmMarkers = [];

  const storeIcon = L.icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/869/869636.png', // Ikon toko/tenda UMKM
    iconSize: [32, 32],
    iconAnchor: [16, 32]
  });

  list.forEach(umkm => {
    if (umkm.latitude && umkm.longitude) {
      const marker = L.marker([umkm.latitude, umkm.longitude], { icon: storeIcon })
        .addTo(leafletMap)
        .bindPopup(`
          <div style="font-family: var(--font-body);">
            <strong style="font-size:1.1rem; color:var(--primary);">${escapeHTML(umkm.name)}</strong><br>
            <span style="font-size:0.8rem; color:var(--secondary); font-weight:700;">${escapeHTML(umkm.category)}</span><br>
            <p style="margin:5px 0; font-size:0.85rem;">${escapeHTML(umkm.description || '')}</p>
            <a href="https://wa.me/${formatPhoneNumber(umkm.whatsapp_number)}" target="_blank" style="color:#25d366; font-weight:bold; font-size:0.85rem;"><i class="fab fa-whatsapp"></i> Hubungi Pemilik</a>
          </div>
        `);
      umkmMarkers.push(marker);
    }
  });
}

function filterUMKM(category) {
  // Ganti kelas aktif tombol filter
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.getAttribute('onclick').includes(category)) {
      btn.classList.add('active');
    }
  });

  const searchVal = document.getElementById('search-umkm')?.value.toLowerCase() || '';
  const dataList = window.allUmkmList || getMockUMKMData();

  const filtered = dataList.filter(item => {
    const matchesCategory = category === 'semua' || item.category.toLowerCase() === category.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(searchVal) || 
                          item.description.toLowerCase().includes(searchVal) || 
                          item.owner.toLowerCase().includes(searchVal);
    return matchesCategory && matchesSearch;
  });

  renderUMKM(filtered);
}

function searchUMKM(val) {
  const query = val.toLowerCase();
  
  // Deteksi kategori aktif
  const activeBtn = document.querySelector('.filter-btn.active');
  let activeCategory = 'semua';
  if (activeBtn) {
    const onclickStr = activeBtn.getAttribute('onclick');
    const match = onclickStr.match(/'([^']+)'/);
    if (match) activeCategory = match[1];
  }

  const dataList = window.allUmkmList || getMockUMKMData();
  const filtered = dataList.filter(item => {
    const matchesCategory = activeCategory === 'semua' || item.category.toLowerCase() === activeCategory.toLowerCase();
    const matchesSearch = item.name.toLowerCase().includes(query) || 
                          item.description.toLowerCase().includes(query) || 
                          item.owner.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  renderUMKM(filtered);
}

// Visualisasi Chart Kependudukan Dusun
function initStatsChart() {
  const ctx = document.getElementById('statsChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pertanian/Buruh', 'Karyawan Swasta', 'PNS/TNI/Polri', 'Pedagang/UMKM', 'Pelajar/Mahasiswa', 'Lainnya'],
      datasets: [{
        label: 'Mata Pencaharian',
        data: [42, 23, 8, 15, 10, 5],
        backgroundColor: [
          '#0f5132', // primary
          '#1e293b', // dark
          '#3b82f6', // info
          '#ffb703', // accent
          '#d4a373', // secondary
          '#cbd5e1'  // gray
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: {
              family: 'Plus Jakarta Sans',
              size: 12
            }
          }
        },
        title: {
          display: true,
          text: 'Mata Pencaharian Warga',
          font: {
            family: 'Outfit',
            size: 16,
            weight: 'bold'
          }
        }
      }
    }
  });
}

function setupContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast('Pesan Anda berhasil dikirim! Kami akan menghubungi Anda segera.', 'success');
    form.reset();
  });
}

// ==========================================
// FASE 3 & 4: DASHBOARD & ADMIN PANEL LOGIC
// ==========================================

async function initDashboard() {
  // Lindungi Halaman: Pastikan user login
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  currentUser = session.user;
  
  // Ambil profil
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error || !profile) {
    // Profil sedang diproses oleh trigger database
    document.getElementById('dashboard-app').innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="logo">
            <img src="https://cdn-icons-png.flaticon.com/512/8030/8030147.png" alt="Logo" style="height:45px;">
            <span>DANGKEL KULON</span>
          </div>
          <i class="fas fa-spinner fa-spin fa-3x text-primary" style="margin-bottom:20px;"></i>
          <h2>Membuat Profil...</h2>
          <p>Sistem sedang mendaftarkan akun Google Anda ke database Dusun. Harap tunggu beberapa detik lalu muat ulang halaman.</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Muat Ulang</button>
        </div>
      </div>
    `;
    return;
  }

  userProfile = profile;

  // Tampilkan dashboard UI berdasarkan status persetujuan
  if (userProfile.status === 'pending') {
    renderPendingState();
    return;
  } else if (userProfile.status === 'rejected') {
    renderRejectedState();
    return;
  }

  // Tampilkan dashboard normal untuk 'approved' user
  renderDashboardUI();
}

function renderPendingState() {
  document.getElementById('dashboard-app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width: 500px;">
        <div class="logo">
          <img src="https://cdn-icons-png.flaticon.com/512/8030/8030147.png" alt="Logo" style="height:45px;">
          <span>DANGKEL KULON</span>
        </div>
        <div style="font-size: 4rem; color: var(--warning); margin-bottom: 20px;">
          <i class="fas fa-user-clock"></i>
        </div>
        <h2>Pendaftaran Menunggu Persetujuan</h2>
        <p style="margin-bottom:20px;">Halo <strong>${escapeHTML(userProfile.full_name || currentUser.email)}</strong>. Akun pendaftaran Anda dengan email <code>${escapeHTML(currentUser.email)}</code> sedang menunggu persetujuan (ACC) dari Kepala Dusun (Super Admin) sebelum Anda dapat mengedit website.</p>
        <div class="pending-banner" style="justify-content: center;">
          <i class="fas fa-info-circle"></i> Hubungi Kepala Dusun untuk mempercepat proses persetujuan.
        </div>
        <button class="btn btn-outline" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Keluar</button>
      </div>
    </div>
  `;
}

function renderRejectedState() {
  document.getElementById('dashboard-app').innerHTML = `
    <div class="auth-wrapper">
      <div class="auth-card" style="max-width: 500px;">
        <div class="logo">
          <img src="https://cdn-icons-png.flaticon.com/512/8030/8030147.png" alt="Logo" style="height:45px;">
          <span>DANGKEL KULON</span>
        </div>
        <div style="font-size: 4rem; color: var(--danger); margin-bottom: 20px;">
          <i class="fas fa-user-times"></i>
        </div>
        <h2>Pendaftaran Ditolak</h2>
        <p style="margin-bottom:25px;">Maaf <strong>${escapeHTML(userProfile.full_name || currentUser.email)}</strong>. Pendaftaran akun Anda telah ditolak oleh Kepala Dusun.</p>
        <button class="btn btn-outline" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Keluar</button>
      </div>
    </div>
  `;
}

function renderDashboardUI() {
  const isSuperAdmin = userProfile.role === 'super_admin';
  const avatar = userProfile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

  document.getElementById('dashboard-app').innerHTML = `
    <div class="dashboard-wrapper">
      <!-- SIDEBAR -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="logo" style="color:var(--white);">
            <img src="https://cdn-icons-png.flaticon.com/512/8030/8030147.png" alt="Logo" style="height:35px;">
            <span>DANGKEL KULON</span>
          </div>
        </div>
        <ul class="sidebar-menu">
          <li class="sidebar-menu-item active" id="menu-ringkasan">
            <a href="#" class="sidebar-menu-link" onclick="switchPanel('ringkasan'); return false;">
              <i class="fas fa-tachometer-alt"></i> <span>Ringkasan</span>
            </a>
          </li>
          <li class="sidebar-menu-item" id="menu-berita">
            <a href="#" class="sidebar-menu-link" onclick="switchPanel('berita'); return false;">
              <i class="fas fa-newspaper"></i> <span>Kelola Berita</span>
            </a>
          </li>
          <li class="sidebar-menu-item" id="menu-umkm">
            <a href="#" class="sidebar-menu-link" onclick="switchPanel('umkm'); return false;">
              <i class="fas fa-store"></i> <span>Kelola UMKM</span>
            </a>
          </li>
          ${isSuperAdmin ? `
          <li class="sidebar-menu-item" id="menu-persetujuan">
            <a href="#" class="sidebar-menu-link" onclick="switchPanel('persetujuan'); return false;">
              <i class="fas fa-users-cog"></i> <span>Persetujuan Akun</span>
            </a>
          </li>
          ` : ''}
          <li class="sidebar-menu-item">
            <a href="index.html" class="sidebar-menu-link">
              <i class="fas fa-globe"></i> <span>Lihat Website</span>
            </a>
          </li>
        </ul>
        <div class="sidebar-footer">
          <img src="${avatar}" alt="Avatar" class="sidebar-avatar">
          <div class="sidebar-user-info">
            <h5>${escapeHTML(userProfile.full_name || 'Admin')}</h5>
            <p>${isSuperAdmin ? 'Kepala Dusun' : 'Perangkat / Pemuda'}</p>
          </div>
          <button class="btn-logout" onclick="logout()" title="Keluar"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </aside>

      <!-- MAIN CONTENT -->
      <main class="dashboard-main">
        <!-- Dashboard Header -->
        <header class="dashboard-header">
          <div>
            <h1>Dashboard Pengelolaan Website</h1>
            <p class="text-muted">Selamat datang kembali, <strong>${escapeHTML(userProfile.full_name)}</strong></p>
          </div>
        </header>

        <!-- PANEL 1: RINGKASAN -->
        <section id="panel-ringkasan" class="dashboard-panel active">
          <div class="card-grid">
            <div class="dash-card">
              <div class="dash-card-header">Total Berita Kegiatan <i class="fas fa-newspaper text-primary"></i></div>
              <div class="dash-card-value" id="dash-count-news">0</div>
            </div>
            <div class="dash-card">
              <div class="dash-card-header">Total UMKM Terdaftar <i class="fas fa-store text-secondary"></i></div>
              <div class="dash-card-value" id="dash-count-umkm">0</div>
            </div>
            <div class="dash-card">
              <div class="dash-card-header">Status Akun Anda <i class="fas fa-user-shield text-success"></i></div>
              <div class="dash-card-value" style="font-size:1.5rem; color:var(--success); margin-top:10px;"><i class="fas fa-check-circle"></i> AKTIF</div>
            </div>
          </div>

          <div class="dash-card" style="margin-top:20px;">
            <h3>Panduan Cepat Admin</h3>
            <p style="margin-top:10px;">Gunakan menu navigasi sebelah kiri untuk mengelola konten website:</p>
            <ul style="margin: 15px 0 0 20px; line-height: 1.8;">
              <li><strong>Kelola Berita</strong>: Digunakan untuk menulis berita kegiatan pemuda/karang taruna baru atau mengedit berita yang sudah ada.</li>
              <li><strong>Kelola UMKM</strong>: Masukkan nama usaha, deskripsi, nomor WhatsApp pemilik, alamat, dan koordinat maps agar marker otomatis terbuat di peta dusun.</li>
              ${isSuperAdmin ? '<li><strong>Persetujuan Akun</strong>: Khusus Kepala Dusun untuk menyetujui (ACC) atau menolak akun perangkat/ketua pemuda baru yang mendaftar.</li>' : ''}
            </ul>
          </div>
        </section>

        <!-- PANEL 2: KELOLA BERITA -->
        <section id="panel-berita" class="dashboard-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3>Daftar Berita Kegiatan Pemuda</h3>
            <button class="btn btn-primary" onclick="openNewsFormModal()"><i class="fas fa-plus"></i> Tambah Berita</button>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Gambar</th>
                  <th>Judul Berita</th>
                  <th>Tanggal Dibuat</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="dash-news-table-body">
                <tr><td colspan="4" class="text-center">Memuat data...</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- PANEL 3: KELOLA UMKM -->
        <section id="panel-umkm" class="dashboard-panel">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <h3>Daftar UMKM Sekitar Dusun</h3>
            <button class="btn btn-primary" onclick="openUmkmFormModal()"><i class="fas fa-plus"></i> Tambah UMKM</button>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Gambar</th>
                  <th>Nama Usaha</th>
                  <th>Pemilik</th>
                  <th>Kategori</th>
                  <th>WhatsApp</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody id="dash-umkm-table-body">
                <tr><td colspan="6" class="text-center">Memuat data...</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- PANEL 4: PERSETUJUAN AKUN (SUPER ADMIN ONLY) -->
        ${isSuperAdmin ? `
        <section id="panel-persetujuan" class="dashboard-panel">
          <h3>Persetujuan Pendaftaran Akun Admin Baru</h3>
          <p class="text-muted" style="margin-bottom:20px;">Menampilkan daftar akun baru yang mendaftar via Google Auth dan memerlukan verifikasi.</p>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nama Pengguna</th>
                  <th>Email Google</th>
                  <th>Status Saat Ini</th>
                  <th>Aksi Verifikasi</th>
                </tr>
              </thead>
              <tbody id="dash-users-table-body">
                <tr><td colspan="4" class="text-center">Memuat data...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        ` : ''}
      </main>
    </div>

    <!-- MODAL NEWS FORM -->
    <div class="modal" id="news-form-modal">
      <div class="modal-overlay" onclick="closeNewsFormModal()"></div>
      <div class="modal-container">
        <div class="modal-header">
          <h3 id="news-modal-title">Tambah Berita Baru</h3>
          <button class="modal-close" onclick="closeNewsFormModal()">&times;</button>
        </div>
        <form id="news-form" onsubmit="saveNews(event)">
          <input type="hidden" id="news-id-field">
          <div class="modal-body">
            <div class="form-group">
              <label for="news-title-field">Judul Berita</label>
              <input type="text" id="news-title-field" class="form-control" required placeholder="Contoh: Kerja Bakti Pembersihan Saluran Air Wetan Dusun">
            </div>
            <div class="form-group">
              <label for="news-image-field">URL Gambar Berita (Optional)</label>
              <input type="url" id="news-image-field" class="form-control" placeholder="https://domain.com/gambar.jpg">
            </div>
            <div class="form-group">
              <label for="news-content-field">Konten/Isi Berita</label>
              <textarea id="news-content-field" class="form-control" required placeholder="Tulis rincian kegiatan pemuda secara lengkap..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeNewsFormModal()">Batal</button>
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL UMKM FORM -->
    <div class="modal" id="umkm-form-modal">
      <div class="modal-overlay" onclick="closeUmkmFormModal()"></div>
      <div class="modal-container" style="max-width: 650px;">
        <div class="modal-header">
          <h3 id="umkm-modal-title">Tambah Data UMKM</h3>
          <button class="modal-close" onclick="closeUmkmFormModal()">&times;</button>
        </div>
        <form id="umkm-form" onsubmit="saveUmkm(event)">
          <input type="hidden" id="umkm-id-field">
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label for="umkm-name-field">Nama UMKM / Usaha</label>
                <input type="text" id="umkm-name-field" class="form-control" required placeholder="Kripik Tempe Renyah Jaya">
              </div>
              <div class="form-group">
                <label for="umkm-owner-field">Nama Pemilik</label>
                <input type="text" id="umkm-owner-field" class="form-control" required placeholder="Pak Slamet">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="umkm-category-field">Kategori Usaha</label>
                <select id="umkm-category-field" class="form-control" required>
                  <option value="Makanan & Minuman">Makanan & Minuman</option>
                  <option value="Kerajinan">Kerajinan</option>
                  <option value="Pertanian">Pertanian</option>
                  <option value="Jasa & Konveksi">Jasa & Konveksi</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
              <div class="form-group">
                <label for="umkm-whatsapp-field">Nomor WhatsApp Aktif</label>
                <input type="text" id="umkm-whatsapp-field" class="form-control" required placeholder="Contoh: 08123456789 atau 628123...">
              </div>
            </div>
            <div class="form-group">
              <label for="umkm-address-field">Alamat Toko / Rumah</label>
              <input type="text" id="umkm-address-field" class="form-control" required placeholder="Dangkel Kulon RT 02 / RW 04">
            </div>
            <div class="form-group">
              <label for="umkm-image-field">URL Foto Produk / Toko (Optional)</label>
              <input type="url" id="umkm-image-field" class="form-control" placeholder="https://domain.com/foto-produk.jpg">
            </div>
            <div class="form-group">
              <label for="umkm-desc-field">Deskripsi Singkat Usaha</label>
              <textarea id="umkm-desc-field" class="form-control" required placeholder="Deskripsikan produk yang dijual, jam buka, dll..."></textarea>
            </div>
            
            <!-- Lokasi Koordinat Peta -->
            <div style="border: 1px solid var(--gray-200); border-radius:12px; padding:15px; background:var(--gray-50);">
              <h4 style="margin-bottom:10px; font-size:0.95rem;"><i class="fas fa-map-marked-alt text-primary"></i> Koordinat Peta Dusun</h4>
              <p class="text-muted" style="font-size:0.8rem; margin-bottom:10px;">Klik peta di bawah untuk menentukan lokasi UMKM secara otomatis, atau ketik koordinatnya.</p>
              <div id="dash-map-picker" style="height: 200px; width: 100%; border-radius:8px; margin-bottom:10px; border:1px solid var(--gray-300);"></div>
              <div class="form-row">
                <div class="form-group" style="margin-bottom:0;">
                  <label for="umkm-lat-field">Latitude</label>
                  <input type="number" step="any" id="umkm-lat-field" class="form-control">
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label for="umkm-lng-field">Longitude</label>
                  <input type="number" step="any" id="umkm-lng-field" class="form-control">
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" onclick="closeUmkmFormModal()">Batal</button>
            <button type="submit" class="btn btn-primary">Simpan</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Muat data untuk masing-masing tabel dashboard
  loadDashboardStats();
  loadDashboardNews();
  loadDashboardUMKM();
  if (isSuperAdmin) {
    loadDashboardUsers();
  }

  // Setup Picker Peta Dashboard
  initDashboardMapPicker();
}

function switchPanel(panelId) {
  // Ganti kelas aktif di sidebar
  document.querySelectorAll('.sidebar-menu-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeMenu = document.getElementById(`menu-${panelId}`);
  if (activeMenu) activeMenu.classList.add('active');

  // Ganti panel dashboard yang ditampilkan
  document.querySelectorAll('.dashboard-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  const targetPanel = document.getElementById(`panel-${panelId}`);
  if (targetPanel) targetPanel.classList.add('active');
}

// Inisialisasi Map Picker di Modal
let dashboardMap = null;
let pickerMarker = null;

function initDashboardMapPicker() {
  // Map picker akan diinisialisasi ketika modal UMKM dibuka agar Leaflet merender dengan benar
}

function triggerDashboardMapInit() {
  setTimeout(() => {
    if (dashboardMap) {
      dashboardMap.remove();
    }
    
    const latField = document.getElementById('umkm-lat-field');
    const lngField = document.getElementById('umkm-lng-field');
    
    let center = defaultCoordinates;
    if (latField.value && lngField.value) {
      center = [parseFloat(latField.value), parseFloat(lngField.value)];
    }

    dashboardMap = L.map('dash-map-picker').setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(dashboardMap);

    if (latField.value && lngField.value) {
      pickerMarker = L.marker(center).addTo(dashboardMap);
    }

    dashboardMap.on('click', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      latField.value = lat.toFixed(6);
      lngField.value = lng.toFixed(6);

      if (pickerMarker) {
        pickerMarker.setLatLng(e.latlng);
      } else {
        pickerMarker = L.marker(e.latlng).addTo(dashboardMap);
      }
    });
  }, 300);
}

// LOAD DATA DASHBOARD
async function loadDashboardStats() {
  try {
    const { count: newsCount } = await supabase
      .from('news')
      .select('*', { count: 'exact', head: true });

    const { count: umkmCount } = await supabase
      .from('umkm')
      .select('*', { count: 'exact', head: true });

    document.getElementById('dash-count-news').innerText = newsCount || 0;
    document.getElementById('dash-count-umkm').innerText = umkmCount || 0;
  } catch (err) {
    console.error('Error stats dashboard:', err);
  }
}

async function loadDashboardNews() {
  const tbody = document.getElementById('dash-news-table-body');
  if (!tbody) return;

  try {
    const { data: newsList, error } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    tbody.innerHTML = '';
    if (newsList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada berita. Klik Tambah Berita untuk mulai menulis!</td></tr>';
      return;
    }

    newsList.forEach(news => {
      const tr = document.createElement('tr');
      const img = news.image_url || 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80';
      const createdDate = new Date(news.created_at).toLocaleDateString('id-ID');

      tr.innerHTML = `
        <td><img src="${img}" alt="${news.title}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
        <td><strong>${escapeHTML(news.title)}</strong></td>
        <td>${createdDate}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-action btn-edit" onclick="editNews(${JSON.stringify(news).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i> Edit</button>
            <button class="btn-action btn-delete" onclick="deleteNews(${news.id})"><i class="fas fa-trash-alt"></i> Hapus</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error berita dashboard:', err);
  }
}

async function loadDashboardUMKM() {
  const tbody = document.getElementById('dash-umkm-table-body');
  if (!tbody) return;

  try {
    const { data: umkmList, error } = await supabase
      .from('umkm')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    tbody.innerHTML = '';
    if (umkmList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Belum ada UMKM. Klik Tambah UMKM untuk menambahkan usaha desa!</td></tr>';
      return;
    }

    umkmList.forEach(umkm => {
      const tr = document.createElement('tr');
      const img = umkm.image_url || 'https://images.unsplash.com/photo-1473187983305-f615310e7daa?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80';

      tr.innerHTML = `
        <td><img src="${img}" alt="${umkm.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;"></td>
        <td><strong>${escapeHTML(umkm.name)}</strong></td>
        <td>${escapeHTML(umkm.owner)}</td>
        <td><span class="badge badge-approved" style="background-color:var(--primary-light); color:var(--primary); font-weight:600;">${escapeHTML(umkm.category)}</span></td>
        <td><code>${escapeHTML(umkm.whatsapp_number)}</code></td>
        <td>
          <div class="actions-cell">
            <button class="btn-action btn-edit" onclick="editUmkm(${JSON.stringify(umkm).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i> Edit</button>
            <button class="btn-action btn-delete" onclick="deleteUmkm(${umkm.id})"><i class="fas fa-trash-alt"></i> Hapus</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error UMKM dashboard:', err);
  }
}

async function loadDashboardUsers() {
  const tbody = document.getElementById('dash-users-table-body');
  if (!tbody) return;

  try {
    // Ambil data profil dari database (kecuali akun super_admin agar tidak bisa diubah statusnya sendiri)
    const { data: users, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('role', 'super_admin')
      .order('created_at', { ascending: false });

    if (error) throw error;

    tbody.innerHTML = '';
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada akun admin baru yang mendaftar.</td></tr>';
      return;
    }

    users.forEach(user => {
      const tr = document.createElement('tr');
      const statusClass = `badge-${user.status}`;
      const statusText = user.status === 'pending' ? 'Menunggu ACC' : 
                         user.status === 'approved' ? 'Disetujui' : 'Ditolak';

      tr.innerHTML = `
        <td>
          <div class="author-info">
            <img src="${user.avatar_url || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'}" alt="Avatar">
            <strong>${escapeHTML(user.full_name || 'N/A')}</strong>
          </div>
        </td>
        <td><code>${escapeHTML(user.email)}</code></td>
        <td><span class="badge ${statusClass}">${statusText}</span></td>
        <td>
          <div class="actions-cell">
            ${user.status !== 'approved' ? `<button class="btn-action btn-approve" onclick="verifyUser('${user.id}', 'approved')"><i class="fas fa-check"></i> ACC</button>` : ''}
            ${user.status !== 'rejected' ? `<button class="btn-action btn-reject" onclick="verifyUser('${user.id}', 'rejected')"><i class="fas fa-times"></i> Tolak</button>` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error memuat data persetujuan pengguna:', err);
  }
}

// ACTION PERSATUAN ADMIN (SUPER ADMIN ONLY)
async function verifyUser(userId, status) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ status: status, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;

    showToast(`Status pengguna berhasil diubah ke: ${status === 'approved' ? 'ACC / Disetujui' : 'Ditolak'}.`, 'success');
    loadDashboardUsers();
  } catch (err) {
    showToast('Gagal memverifikasi pengguna: ' + err.message, 'error');
  }
}

// SAVE & ACTION BERITA
function openNewsFormModal() {
  document.getElementById('news-form').reset();
  document.getElementById('news-id-field').value = '';
  document.getElementById('news-modal-title').innerText = 'Tambah Berita Baru';
  document.getElementById('news-form-modal').classList.add('active');
}

function closeNewsFormModal() {
  document.getElementById('news-form-modal').classList.remove('active');
}

async function saveNews(e) {
  e.preventDefault();
  const id = document.getElementById('news-id-field').value;
  const title = document.getElementById('news-title-field').value;
  const imageUrl = document.getElementById('news-image-field').value;
  const content = document.getElementById('news-content-field').value;

  const payload = {
    title,
    content,
    image_url: imageUrl || null,
    author_id: currentUser.id,
    updated_at: new Date().toISOString()
  };

  try {
    let result;
    if (id) {
      // Update
      result = await supabase
        .from('news')
        .update(payload)
        .eq('id', id);
    } else {
      // Insert
      payload.created_at = new Date().toISOString();
      result = await supabase
        .from('news')
        .insert([payload]);
    }

    if (result.error) throw result.error;

    showToast('Berita berhasil disimpan!', 'success');
    closeNewsFormModal();
    loadDashboardNews();
    loadDashboardStats();
  } catch (err) {
    showToast('Gagal menyimpan berita: ' + err.message, 'error');
  }
}

function editNews(news) {
  document.getElementById('news-id-field').value = news.id;
  document.getElementById('news-title-field').value = news.title;
  document.getElementById('news-image-field').value = news.image_url || '';
  document.getElementById('news-content-field').value = news.content;

  document.getElementById('news-modal-title').innerText = 'Edit Berita';
  document.getElementById('news-form-modal').classList.add('active');
}

async function deleteNews(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus berita ini secara permanen?')) return;

  try {
    const { error } = await supabase
      .from('news')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Berita berhasil dihapus.', 'success');
    loadDashboardNews();
    loadDashboardStats();
  } catch (err) {
    showToast('Gagal menghapus berita: ' + err.message, 'error');
  }
}

// SAVE & ACTION UMKM
function openUmkmFormModal() {
  document.getElementById('umkm-form').reset();
  document.getElementById('umkm-id-field').value = '';
  document.getElementById('umkm-lat-field').value = '';
  document.getElementById('umkm-lng-field').value = '';
  pickerMarker = null;

  document.getElementById('umkm-modal-title').innerText = 'Tambah Data UMKM';
  document.getElementById('umkm-form-modal').classList.add('active');
  triggerDashboardMapInit();
}

function closeUmkmFormModal() {
  document.getElementById('umkm-form-modal').classList.remove('active');
}

async function saveUmkm(e) {
  e.preventDefault();
  const id = document.getElementById('umkm-id-field').value;
  const name = document.getElementById('umkm-name-field').value;
  const owner = document.getElementById('umkm-owner-field').value;
  const category = document.getElementById('umkm-category-field').value;
  const whatsappNumber = document.getElementById('umkm-whatsapp-field').value;
  const address = document.getElementById('umkm-address-field').value;
  const imageUrl = document.getElementById('umkm-image-field').value;
  const description = document.getElementById('umkm-desc-field').value;
  const latitude = document.getElementById('umkm-lat-field').value;
  const longitude = document.getElementById('umkm-lng-field').value;

  const payload = {
    name,
    owner,
    category,
    whatsapp_number: whatsappNumber,
    address,
    image_url: imageUrl || null,
    description,
    latitude: latitude ? parseFloat(latitude) : null,
    longitude: longitude ? parseFloat(longitude) : null
  };

  try {
    let result;
    if (id) {
      // Update
      result = await supabase
        .from('umkm')
        .update(payload)
        .eq('id', id);
    } else {
      // Insert
      result = await supabase
        .from('umkm')
        .insert([payload]);
    }

    if (result.error) throw result.error;

    showToast('Data UMKM berhasil disimpan!', 'success');
    closeUmkmFormModal();
    loadDashboardUMKM();
    loadDashboardStats();
  } catch (err) {
    showToast('Gagal menyimpan UMKM: ' + err.message, 'error');
  }
}

function editUmkm(umkm) {
  document.getElementById('umkm-id-field').value = umkm.id;
  document.getElementById('umkm-name-field').value = umkm.name;
  document.getElementById('umkm-owner-field').value = umkm.owner;
  document.getElementById('umkm-category-field').value = umkm.category;
  document.getElementById('umkm-whatsapp-field').value = umkm.whatsapp_number;
  document.getElementById('umkm-address-field').value = umkm.address;
  document.getElementById('umkm-image-field').value = umkm.image_url || '';
  document.getElementById('umkm-desc-field').value = umkm.description || '';
  document.getElementById('umkm-lat-field').value = umkm.latitude || '';
  document.getElementById('umkm-lng-field').value = umkm.longitude || '';

  document.getElementById('umkm-modal-title').innerText = 'Edit Data UMKM';
  document.getElementById('umkm-form-modal').classList.add('active');
  triggerDashboardMapInit();
}

async function deleteUmkm(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus UMKM ini dari direktori?')) return;

  try {
    const { error } = await supabase
      .from('umkm')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Data UMKM berhasil dihapus.', 'success');
    loadDashboardUMKM();
    loadDashboardStats();
  } catch (err) {
    showToast('Gagal menghapus UMKM: ' + err.message, 'error');
  }
}


// ==========================================
// UTILITIES & HELPER FUNCTIONS
// ==========================================

function setupMobileNav() {
  const burger = document.querySelector('.burger');
  const nav = document.querySelector('.nav-links');
  
  if (burger && nav) {
    burger.addEventListener('click', () => {
      nav.classList.toggle('active');
      burger.classList.toggle('toggle');
    });

    // Close menu when link is clicked
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => {
        nav.classList.remove('active');
        burger.classList.remove('toggle');
      });
    });
  }
}

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';
  if (type === 'warning') icon = 'fa-exclamation-triangle';

  toast.innerHTML = `
    <i class="fas ${icon}"></i>
    <span>${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  // Hapus setelah 4 detik
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function formatPhoneNumber(num) {
  // Ubah '08...' menjadi '628...' untuk link WhatsApp
  let formatted = num.replace(/[^0-9]/g, '');
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.slice(1);
  }
  return formatted;
}

// ==========================================
// MOCK DATA UNTUK PENGUJIAN LOKAL (JIKA TANPA SUPABASE)
// ==========================================

function getMockNewsData() {
  return [
    {
      id: 1,
      title: 'Festival Pemuda Dangkel Kulon 2026 Sukses Digelar',
      content: 'Kemeriahan menyelimuti Dusun Dangkel Kulon dalam perayaan hari ulang tahun karang taruna tahun ini. Berbagai lomba tradisional, pertunjukan seni gamelan pemuda, serta bazaar kuliner UMKM lokal berhasil menarik ratusan pengunjung dari dusun sekitar. Ketua Pemuda menyampaikan rasa bangga atas kekompakan seluruh panitia remaja yang telah mempersiapkan acara dengan gotong royong.',
      image_url: 'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 hari lalu
      author: { full_name: 'Dwi Prasetyo (Ketua Pemuda)', avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }
    },
    {
      id: 2,
      title: 'Pelatihan Pemasaran Digital bagi Pelaku UMKM Dusun',
      content: 'Mendorong UMKM Go Digital, perangkat dusun bekerja sama dengan divisi pemuda menyelenggarakan workshop digital marketing. Pelatihan ini memandu para ibu-ibu pedagang makanan tradisional dan kerajinan tangan cara membuat foto produk yang menarik, membuat link order WhatsApp, dan memasarkannya melalui jejaring sosial. Kegiatan ini diharapkan dapat memperluas pangsa pasar luar daerah.',
      image_url: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 hari lalu
      author: { full_name: 'Siti Aminah (Perangkat Desa)', avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135768.png' }
    },
    {
      id: 3,
      title: 'Rapat Rutin Koordinasi Kebersihan Lingkungan Dusun',
      content: 'Para pemuda karang taruna Dangkel Kulon bersama warga melakukan rapat bulanan guna menyusun jadwal kerja bakti berkala menjelang musim penghujan. Fokus utama agenda sosial kali ini adalah normalisasi saluran pembuangan air di sekitar RT 01 dan RT 02 untuk mencegah genangan air serta mengantisipasi jentik nyamuk DBD.',
      image_url: 'https://images.unsplash.com/photo-1511632765486-a01980e01a18?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
      created_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
      author: { full_name: 'Dwi Prasetyo (Ketua Pemuda)', avatar_url: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' }
    }
  ];
}

function getMockUMKMData() {
  return [
    {
      id: 101,
      name: 'Kripik Tempe Renyah "Mbak Sri"',
      owner: 'Mbak Sri',
      category: 'Makanan & Minuman',
      description: 'Kripik tempe renyah dengan bumbu rempah alami warisan keluarga. Tanpa bahan pengawet, dijamin gurih dan cocok untuk camilan atau oleh-oleh khas Dangkel.',
      whatsapp_number: '081234567890',
      address: 'Dangkel Kulon RT 02 / RW 01',
      latitude: -7.3686,
      longitude: 110.3325,
      image_url: 'https://images.unsplash.com/photo-1621263764928-df1444c5e859?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    },
    {
      id: 102,
      name: 'Anyaman Bambu Estetik "Karya Mandiri"',
      owner: 'Pak Bowo',
      category: 'Kerajinan',
      description: 'Menjual kerajinan anyaman bambu berkualitas tinggi untuk dekorasi interior, wadah makanan tradisional, besek, dan kap lampu hias modern ramah lingkungan.',
      whatsapp_number: '085799988811',
      address: 'Dangkel Kulon RT 04 / RW 02',
      latitude: -7.3672,
      longitude: 110.3355,
      image_url: 'https://images.unsplash.com/photo-1598965402049-74e53e192534?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    },
    {
      id: 103,
      name: 'Madu Asli Hutan Pinus Dangkel',
      owner: 'Mas Hendra',
      category: 'Lainnya',
      description: 'Madu murni 100% dipanen langsung dari peternakan lebah hutan pinus lereng pegunungan Dangkel Kulon. Membantu menjaga stamina tubuh tetap fit alami.',
      whatsapp_number: '082244455566',
      address: 'Dangkel Kulon RT 01 / RW 03',
      latitude: -7.3698,
      longitude: 110.3345,
      image_url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    }
  ];
}

function loadMockNews() {
  const container = document.getElementById('news-container');
  if (!container) return;
  
  const mockNews = getMockNewsData();
  container.innerHTML = '';
  mockNews.forEach(news => {
    container.appendChild(createNewsCard(news));
  });
}

function loadMockUMKM() {
  const container = document.getElementById('umkm-container');
  if (!container) return;
  
  const mockUmkm = getMockUMKMData();
  window.allUmkmList = mockUmkm;
  renderUMKM(mockUmkm);
  addUMKMMarkers(mockUmkm);
}

// ==========================================
// CONFIGURATION PANEL FOR OFFLINE / TESTING
// ==========================================

function setupConfigPanel() {
  const footerElement = document.querySelector('footer');
  if (!footerElement) return;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background-color: var(--gray-100);
    border-top: 1px solid var(--gray-200);
    padding: 30px 0;
    text-align: center;
    font-size: 0.9rem;
    position: relative;
    z-index: 50;
  `;

  panel.innerHTML = `
    <div class="container" style="max-width: 600px;">
      <h4 style="margin-bottom: 10px; color: var(--primary);"><i class="fas fa-database"></i> Panel Konfigurasi Database Lokal</h4>
      <p class="text-muted" style="margin-bottom: 20px;">Masukkan detail API Supabase Anda untuk menghubungkan fitur Login Google dan Dashboard secara langsung.</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <input type="text" id="cfg-url" class="form-control" placeholder="Supabase Project URL" value="${SUPABASE_URL}">
        <input type="password" id="cfg-key" class="form-control" placeholder="Supabase Anon Key" value="${SUPABASE_KEY}">
        <button class="btn btn-primary" onclick="saveSupabaseConfig()" style="width: 100%;">Hubungkan Supabase</button>
        ${SUPABASE_URL ? `<button class="btn btn-outline" onclick="clearSupabaseConfig()" style="width: 100%; margin-top:5px; border-color:var(--danger); color:var(--danger)">Putuskan Hubungan</button>` : ''}
      </div>
    </div>
  `;

  // Sisipkan sebelum footer
  footerElement.parentNode.insertBefore(panel, footerElement);
}

function saveSupabaseConfig() {
  const url = document.getElementById('cfg-url').value.trim();
  const key = document.getElementById('cfg-key').value.trim();

  if (!url || !key) {
    showToast('Harap isi URL dan Anon Key Supabase!', 'warning');
    return;
  }

  localStorage.setItem('SB_URL', url);
  localStorage.setItem('SB_KEY', key);
  showToast('Konfigurasi disimpan! Halaman akan dimuat ulang...', 'success');

  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

function clearSupabaseConfig() {
  localStorage.removeItem('SB_URL');
  localStorage.removeItem('SB_KEY');
  showToast('Konfigurasi dihapus. Website kembali menggunakan data uji (mock)!', 'info');
  
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

function showConfigBanner() {
  const container = document.querySelector('.header .nav-container');
  if (!container) return;

  const banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.style.cssText = `
    background-color: var(--warning);
    color: var(--dark);
    font-size: 0.8rem;
    font-weight: 700;
    padding: 6px 12px;
    text-align: center;
    width: 100%;
    position: fixed;
    top: var(--header-height);
    left: 0;
    z-index: 999;
    box-shadow: var(--shadow-sm);
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
  `;
  banner.innerHTML = `
    <span><i class="fas fa-info-circle"></i> Mode Demo: Database belum terhubung. Gunakan form konfigurasi di bagian bawah halaman untuk menghubungkan Supabase Anda.</span>
  `;
  
  document.body.appendChild(banner);
  document.body.style.paddingTop = '32px';
}
