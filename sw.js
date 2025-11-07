// Tên các bộ nhớ đệm (cache)
const STATIC_CACHE_NAME = 'static-cache-v1';
const AUDIO_CACHE_NAME = 'audio-cache-v1'; // Phải khớp với main.js

// Danh sách các file "vỏ" ứng dụng cần lưu ngay
const STATIC_ASSETS = [
    '/',
    'index.html',
    'style.css',
    'main.js',
    'words.json',
    'manifest.json',
    'images/icon-192.png',
    'images/icon-512.png'
];

// --- 1. Cài đặt (Install) ---
// Tải và lưu các file "vỏ" ứng dụng
self.addEventListener('install', event => {
    console.log('[SW] Đang cài đặt...');
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then(cache => {
                console.log('[SW] Đang cache các file tĩnh...');
                // Bỏ qua lỗi nếu 1 file không tải được (ví dụ: /)
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
                return self.skipWaiting(); // Kích hoạt ngay
            })
    );
});

// --- 2. Kích hoạt (Activate) ---
// Xóa các cache cũ nếu có
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
        }).then(() => self.clients.claim()) // Giành quyền kiểm soát trang
    );
});

// --- 3. Tải (Fetch) ---
// Can thiệp vào các yêu cầu mạng
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Chiến lược 1: Chỉ cache (Cache Only) cho file âm thanh
    // (Vì main.js đã xử lý việc tải và lưu vào cache)
    if (url.origin === 'https://ssl.gstatic.com' || url.href.includes('.mp3')) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    // Nếu có trong cache thì trả về, không thì để mạng tự xử lý
                    return cachedResponse || fetch(event.request);
                });
            })
        );
        return; // Dừng tại đây
    }

    // Chiến lược 2: Ưu tiên mạng, nếu không thì lấy cache (Network First) cho API
    // (Áp dụng cho words.json để luôn có dữ liệu mới)
    if (event.request.url.includes('words.json')) {
        event.respondWith(
            caches.open(STATIC_CACHE_NAME).then(cache => {
                return fetch(event.request).then(networkResponse => {
                    // Tải thành công -> lưu vào cache
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                }).catch(() => {
                    // Tải thất bại -> lấy từ cache
                    return cache.match(event.request);
                });
            })
        );
        return; // Dừng tại đây
    }

    // Chiến lược 3: Ưu tiên cache, nếu không thì lấy mạng (Cache First) cho các file tĩnh
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                // Tùy chọn: lưu lại các file tĩnh khác nếu cần
                // caches.open(STATIC_CACHE_NAME).then(cache => {
                //     cache.put(event.request, networkResponse.clone());
                // });
                return networkResponse;
            });
        })
    );
});