// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (GOOGLE SHEETS + LOCALSTORAGE)
// ***********************************************

// --- Cài đặt Chung ---
// !!! QUAN TRỌNG: DÁN URL ỨNG DỤNG WEB MỚI TỪ DEPLOYMENT VÀO ĐÂY
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxshuYRDZZUNwoOOG1_ME3tFO6RljsmvImNRFv35WgDkODRLqx-jaz0EaEXTGR6Wwiq/exec';  // ← DÁN URL MỚI!

const PROGRESS_STORAGE_KEY = 'vocabAppProgress';
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const WORDS_PER_ROUND = 6;

const SRS_LEVELS = {0:0,1:1,2:3,3:7,4:14,5:30,6:60};
const MAX_LEVEL = 6;

let allWords = [];
let progress = {};
let currentWords = [];
let selectedLeft = null;
let selectedRight = null;
let correctPairs = 0;
let totalScore = 0;
let gameMode = null;
let selectedTopic = "Tất cả";
let isChecking = false;

// DOM Elements (giữ nguyên như cũ)
let gameContainer, leftColumn, rightColumn, progressBar, scoreDisplay, nextRoundButton, loader, loaderText, gameTitle;
let modeSelectionOverlay, modeAudioButton, modeTextButton, loadingStatus;
let header, mainContent;
let topicSelectionOverlay, topicListContainer, topicBackButton;
let settingsModal, settingsButton, settingsCloseButton, statsButton, homeButton, reloadButton;
let syncButton;
let statsModal, statsCloseButton, statsListContainer;

// Khởi động
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    // Gán DOM (giữ nguyên)
    // ... (copy từ code cũ của bạn)

    addEventListeners();

    if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.register('sw.js');
    }

    await loadData();

    setInterval(syncProgressToSheet, 300000); // Auto sync 5p
}

// loadData() với FIX NGÀY THÁNG
async function loadData() {
    try {
        if (GOOGLE_APPS_SCRIPT_URL.includes('[ID_MỚI]')) throw new Error('URL chưa cập nhật!');

        const response = await fetch(GOOGLE_APPS_SCRIPT_URL);
        if (!response.ok) throw new Error(`Lỗi GET: ${response.status}`);
        const result = await response.json();

        if (!result.success) throw new Error(result.error);

        allWords = result.data;

        // (FIX) Chuẩn hóa nextReview
        allWords = allWords.map(word => ({
            ...word,
            nextReview: word.nextReview ? word.nextReview.split('T')[0] : getTodayString()
        }));

        progress = loadProgress();
        syncProgress(allWords);

        loadingStatus.textContent = "Sẵn sàng!";
        loadingStatus.style.color = "var(--correct-color)";
        modeAudioButton.disabled = false;
        modeTextButton.disabled = false;

    } catch (error) {
        console.error(error);
        loadingStatus.textContent = `Lỗi: ${error.message}`;
        loadingStatus.style.color = "var(--incorrect-color)";
        alert(error.message);
    }
}

// syncProgressToSheet với RETRY
async function syncProgressToSheet(retryCount = 0) {
    showLoader(true, "Đang đồng bộ...");
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(progress),
            headers: {'Content-Type': 'application/json'},
            mode: 'cors'
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        if (result.success) {
            showLoader(true, `Thành công! (${result.updated} từ)`);
            setTimeout(() => showLoader(false), 1500);
            return;
        }
        throw new Error(result.error);

    } catch (error) {
        console.error("Sync error:", error);
        if (retryCount < 2) {  // Retry 2 lần
            showLoader(true, `Thử lại... (${retryCount + 1}/3)`);
            setTimeout(() => syncProgressToSheet(retryCount + 1), 2000);
            return;
        }
        showLoader(true, `Lỗi: ${error.message}`);
        setTimeout(() => showLoader(false), 3000);
    }
}

// syncProgress với FIX NGÀY
function syncProgress(wordsFromSheet) {
    const today = getTodayString();
    let updated = false;

    for (const word of wordsFromSheet) {
        if (!progress[word.id]) {
            progress[word.id] = {
                level: word.level,
                nextReview: word.nextReview,  // Đã chuẩn hóa YYYY-MM-DD
                phonetic: null
            };
            updated = true;
        }
    }
    if (updated) saveProgress();
}

// Các hàm khác (giữ nguyên: getWordsToReview, startNewRound, v.v.)
// ... (copy toàn bộ từ code cũ của bạn, chỉ thêm fix ở trên)

function getTodayString() {
    return new Date().toISOString().split('T')[0];  // 2025-11-09
}

// ... (phần còn lại giống code cũ)