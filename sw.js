// Tên các bộ nhớ đệm (cache)
const STATIC_CACHE_NAME = 'static-cache-v1';
const AUDIO_CACHE_NAME = 'audio-cache-v1'; // Phải khớp với main.js

// Danh sách các file "vỏ" ứng dụng cần lưu ngay
const STATIC_ASSETS = [
    '/',
    'index.html',
    'style.css',
    'main.js',
    // 'words.json', // Xóa vì giờ chúng ta tải từ Google Sheet
    'manifest.json',
    'images/icon-192.png',
    'images/icon-512.png'
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
                        return cache.add(url).catch(reason => {
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

    // (CẬP NHẬT) Chiến lược 0: Bỏ qua Google Apps Script
    // Luôn lấy từ mạng
    if (url.href.includes('macros.google.com')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Chiến lược 1: Chỉ cache (Cache Only) cho file âm thanh
    if (url.origin === 'https://ssl.gstatic.com' || url.href.includes('.mp3')) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    return cachedResponse || fetch(event.request);
                });
            })
        );
        return;
    }

    // Chiến lược 2: Ưu tiên cache, nếu không thì lấy mạng (Cache First) cho các file tĩnh
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then(networkResponse => {
                // Tùy chọn: cache lại các file tĩnh nếu cần
                // caches.open(STATIC_CACHE_NAME).then(cache => {
                //     cache.put(event.request, networkResponse.clone());
                // });
                return networkResponse;
            });
        })
    );
});