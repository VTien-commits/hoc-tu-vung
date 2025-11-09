// Tên các bộ nhớ đệm (cache)
const STATIC_CACHE_NAME = 'static-cache-v1';
const AUDIO_CACHE_NAME = 'audio-cache-v1'; // Phải khớp với main.js

// Danh sách các file "vỏ" ứng dụng cần lưu ngay
const STATIC_ASSETS = [
    '/',
    'index.html',
    'style.css',
    'main.js',
    // 'words.json', // (Đã xóa)
    'manifest.json',
    'images/icon-192.png',
    'images/icon-512.png',
    // (MỚI) Cache thư viện Excel
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// --- 1. Cài đặt (Install) ---
self.addEventListener('install', event => {
    console.log('[SW] Đang cài đặt...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('[SW] Đang cache các file tĩnh...');
                return Promise.all(
                    STATIC_ASSETS.map(url => {
                        // (CẬP NHẬT) Đối với các file bên ngoài (CDN), chúng ta cần Request
                        // mà không có credentials (no-cors) để tránh lỗi
                        const request = new Request(url, { mode: 'no-cors' });
                        return cache.add(request).catch(reason => {
                            console.warn(`[SW] Không cache được ${url}: ${reason}`);
                        });
                    })
                );
            })
            .then(() => {
                console.log('[SW] Cài đặt thành công.');
                return self.skipWaiting();
            })
    );
});

// --- 2. Kích hoạt (Activate) ---
self.addEventListener('activate', event => {
    console.log('[SW] Đang kích hoạt...');
    const cacheAllowlist = [STATIC_CACHE_NAME, AUDIO_CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheAllowlist.includes(cacheName)) {
                        console.log(`[SW] Xóa cache cũ: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// --- 3. Tải (Fetch) ---
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // (CẬP NHẬT) Chiến lược 0: Bỏ qua Google Apps Script (luôn lấy từ mạng)
    // Điều này quan trọng để luôn nhận được danh sách từ vựng mới nhất
    if (url.href.includes('macros.google.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Chiến lược 1: Chỉ cache (Cache Only) cho file âm thanh
    if (url.origin === 'https://ssl.gstatic.com' || url.href.includes('.mp3')) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    // Nếu có trong cache thì dùng, không thì tải mới
                    return cachedResponse || fetch(event.request);
                });
            })
        );
        return;
    }

    // (MỚI) Chiến lược 2: Ưu tiên cache cho thư viện Excel
    if (url.href.includes('cdnjs.cloudflare.com/ajax/libs/xlsx')) {
        event.respondWith(
            caches.match(event.request).then(cachedResponse => {
                // Ưu tiên cache, nếu không có thì tải
                return cachedResponse || fetch(event.request);
            })
        );
        return;
    }

    // Chiến lược 3: Ưu tiên cache, nếu không thì lấy mạng (Cache First) cho các file tĩnh
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            // Nếu không có trong cache, tải từ mạng
            return fetch(event.request).then(networkResponse => {
                // Không cần cache lại ở đây vì đã cache lúc install
                return networkResponse;
            });
        })
    );
});