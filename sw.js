// Tên các bộ nhớ đệm (cache)
const STATIC_CACHE_NAME = 'static-cache-v1';
const AUDIO_CACHE_NAME = 'audio-cache-v1'; // Phải khớp với main.js

// Danh sách các file "vỏ" ứng dụng cần lưu ngay
const STATIC_ASSETS = [
    '/',
    'index.html',
    'style.css',
    'main.js',
    'words.json', // words.json được lưu ngay khi cài đặt
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
                    // (main.js sẽ xử lý việc tải và lưu nếu không tìm thấy)
                    return cachedResponse || fetch(event.request);
                });
            })
        );
        return; // Dừng tại đây
    }

    // (ĐÃ XÓA) Chiến lược 2: Ưu tiên mạng cho 'words.json' đã bị xóa.
    // Tệp 'words.json' bây giờ sẽ được xử lý bởi Chiến lược 3.

    // Chiến lược 3: Ưu tiên cache, nếu không thì lấy mạng (Cache First) cho các file tĩnh
    // (Bao gồm 'words.json' vì nó nằm trong STATIC_ASSETS)
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Nếu tìm thấy trong cache, trả về ngay lập tức
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // Nếu không, đi lấy từ mạng
            return fetch(event.request).then(networkResponse => {
                // (Tùy chọn) Bạn có thể cache lại ở đây nếu muốn,
                // nhưng vì nó đã có trong STATIC_ASSETS, việc này không quá cần thiết
                // trừ khi file đó không nằm trong danh sách ban đầu.
                // caches.open(STATIC_CACHE_NAME).then(cache => {
                //     cache.put(event.request, networkResponse.clone());
                // });
                return networkResponse;
            });
        })
    );
});