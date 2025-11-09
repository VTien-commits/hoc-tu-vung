// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// ... existing code ... -->
let resetProgressButton, confirmResetModal, confirmResetCancel, confirmResetConfirm;
// (MỚI) DOM cho Modal Xóa Cache
let confirmCacheModal, confirmCacheCancel, confirmCacheConfirm;


// --- Khởi động ---
// ... existing code ... -->
    statsCloseButton = document.getElementById('stats-close-button');
    statsListContainer = document.getElementById('stats-list');
    statsTopicFilter = document.getElementById('stats-topic-filter'); // (MỚI)

    // (MỚI) Modal Xác nhận Reset
    confirmResetModal = document.getElementById('confirm-reset-modal');
    confirmResetCancel = document.getElementById('confirm-reset-cancel');
    confirmResetConfirm = document.getElementById('confirm-reset-confirm');

    // (MỚI) Modal Xác nhận Xóa Cache
    confirmCacheModal = document.getElementById('confirm-cache-modal');
    confirmCacheCancel = document.getElementById('confirm-cache-cancel');
    confirmCacheConfirm = document.getElementById('confirm-cache-confirm');

    // 2. Gán tất cả sự kiện
    addEventListeners();
// ... existing code ... -->
    // Modal Cài đặt
    settingsCloseButton.addEventListener('click', closeSettingsModal);
    clearCacheButton.addEventListener('click', openConfirmClearCacheModal); // (CẬP NHẬT)
    statsButton.addEventListener('click', openStatsModal);
    exportExcelButton.addEventListener('click', exportToExcel);
// ... existing code ... -->
    statsTopicFilter.addEventListener('change', populateStatsList); // (MỚI)

    // (MỚI) Modal Xác nhận Reset
    confirmResetCancel.addEventListener('click', closeConfirmResetModal);
    confirmResetConfirm.addEventListener('click', resetAllProgress);

    // (MỚI) Modal Xác nhận Xóa Cache
    confirmCacheCancel.addEventListener('click', closeConfirmClearCacheModal);
    confirmCacheConfirm.addEventListener('click', () => {
        closeConfirmClearCacheModal();
        clearAudioCache(); // Gọi hàm xóa gốc
    });
}

// Hàm Tải lại ứng dụng (Gỡ Service Worker)
// ... existing code ... -->
        setTimeout(() => { showLoader(false); }, 1500); 
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
// ... existing code ... -->
// --- (MỚI) Các hàm Modal ---

// (MỚI) Học lại từ đầu
function openConfirmResetModal() {
// ... existing code ... -->
    settingsModal.style.display = 'flex';
}
function resetAllProgress() {
    showLoader(true, "Đang reset tiến độ...");
// ... existing code ... -->
        window.location.reload(); // Tải lại ứng dụng
    }, 1500);
}

// (MỚI) Xóa Cache Audio
function openConfirmClearCacheModal() {
    settingsModal.style.display = 'none';
    confirmCacheModal.style.display = 'flex';
}
function closeConfirmClearCacheModal() {
    confirmCacheModal.style.display = 'none';
    settingsModal.style.display = 'flex';
}


// Mở Modal Cài đặt
// ... existing code ... -->
    statsListContainer.innerHTML = ''; // Xóa cũ
    
    // (MỚI) Lấy chủ đề được chọn
// ... existing code ... -->
    wordsFromProgress.sort((a, b) => b.level - a.level);
    
    // (MỚI) Cập nhật tổng số từ
    document.getElementById('stats-total-count').textContent = `Tổng số từ: ${wordsFromProgress.length}`;

    // 3. Tạo HTML
    wordsFromProgress.forEach(word => {
// ... existing code ... -->
        item.className = 'stat-item';
        item.dataset.word = word.english; 
        
        // (CẬP NHẬT) Tạo chuỗi phiên âm theo yêu cầu
        const phoneticDisplay = word.phonetic ? ` / <span class="stat-word-phonetic">${word.phonetic}</span>` : "";

        item.innerHTML = `
            <div class="stat-word">
                <div><span class="stat-word-english">${word.english}</span>${phoneticDisplay}</div> 
                <div class="stat-word-vietnamese">${word.vietnamese}</div>
            </div>
            <span class="stat-level stat-level-${String(word.level)}">Level ${word.level}</span>
        `;
        
        item.addEventListener('click', handleStatItemClick);
// ... existing code ... -->