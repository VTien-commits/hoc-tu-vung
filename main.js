// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (Tải từ Google Sheet + Lưu vào LocalStorage)
// ***********************************************

// --- Cài đặt Chung ---
// (GIỮ NGUYÊN) Vẫn cần URL để TẢI dữ liệu
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyOeRAjUsPpgizXQOpuFnuElYQ7ZWwxUZJilRnymmcuCafZ965a1fPiEzVx5l_tP6c/exec'; 

// (ĐÃ XÓA) Không cần khóa lưu allWords, vì nó được tải mỗi lần
// const ALL_WORDS_STORAGE_KEY = 'vocabAppAllWords';
const PROGRESS_STORAGE_KEY = 'vocabAppProgress'; // Khóa lưu "trí nhớ" cục bộ
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const WORDS_PER_ROUND = 6; // Số từ mỗi màn

// Khoảng thời gian lặp lại (theo level), tính bằng ngày
const SRS_LEVELS = {
    0: 0,   // Mới học (sẽ ôn lại trong màn này)
    1: 1,   // 1 ngày
    2: 3,   // 3 ngày
    3: 7,   // 1 tuần
    4: 14,  // 2 tuần
    5: 30,  // 1 tháng
    6: 60   // 2 tháng (đã thuộc)
};
const MAX_LEVEL = 6;

// --- Biến toàn cục ---
let allWords = []; // Kho từ vựng đầy đủ (tải từ Google Sheet)
let progress = {}; // "Trí nhớ" về tiến độ học (lưu trên localStorage)
let currentWords = []; // 6 từ trong màn hiện tại
let selectedLeft = null;
let selectedRight = null;
let correctPairs = 0;
let totalScore = 0;
let gameMode = null; // 'audio-only' hoặc 'phonetic-text'
let selectedTopic = "Tất cả"; // Chủ đề đang chơi
let isChecking = false; // Thêm biến "khóa" để chống lỗi race condition

// --- DOM Elements ---
let gameContainer, leftColumn, rightColumn, progressBar, scoreDisplay, nextRoundButton, loader, loaderText, gameTitle, clearCacheButton;
let modeSelectionOverlay, modeAudioButton, modeTextButton, loadingStatus;
let header, mainContent;
let topicSelectionOverlay, topicListContainer, topicBackButton; // Chọn chủ đề
let settingsModal, settingsButton, settingsCloseButton, statsButton, homeButton, reloadButton; // Cài đặt
// (MỚI) Thêm nút xuất excel
let exportExcelButton;
// (ĐÃ XÓA) Không cần nút syncButton
// let syncButton; 
let statsModal, statsCloseButton, statsListContainer; // Thống kê


// --- Khởi động ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    
    // 1. Gán giá trị cho DOM Elements
    gameContainer = document.getElementById('game-container');
    leftColumn = document.getElementById('left-column');
    rightColumn = document.getElementById('right-column');
    progressBar = document.getElementById('progress-bar');
    scoreDisplay = document.getElementById('score');
    nextRoundButton = document.getElementById('next-round-button');
    loader = document.getElementById('loader');
    loaderText = document.getElementById('loader-text');
    gameTitle = document.getElementById('game-title');
    header = document.querySelector('header');
    mainContent = document.querySelector('.main-container');
    
    // Màn hình 1: Chọn chế độ
    modeSelectionOverlay = document.getElementById('mode-selection-overlay');
    modeAudioButton = document.getElementById('mode-audio-button');
    modeTextButton = document.getElementById('mode-text-button');
    loadingStatus = document.getElementById('loading-status');

    // Màn hình 2: Chọn chủ đề
    topicSelectionOverlay = document.getElementById('topic-selection-overlay');
    topicListContainer = document.getElementById('topic-list'); 
    topicBackButton = document.getElementById('topic-back-button');

    // Màn hình 3: Các nút Header
    homeButton = document.getElementById('home-button');
    settingsButton = document.getElementById('settings-button');
    // (ĐÃ XÓA) Không cần nút sync
    // syncButton = document.getElementById('sync-button'); 

    // Modal Cài đặt
    settingsModal = document.getElementById('settings-modal');
    settingsCloseButton = document.getElementById('settings-close-button');
    statsButton = document.getElementById('stats-button');
    clearCacheButton = document.getElementById('clear-cache-button');
    reloadButton = document.getElementById('reload-button');
    // (MỚI) Gán nút xuất excel
    exportExcelButton = document.getElementById('export-excel-button');

    // Modal Thống kê
    statsModal = document.getElementById('stats-modal');
    statsCloseButton = document.getElementById('stats-close-button');
    statsListContainer = document.getElementById('stats-list');

    // 2. Gán tất cả sự kiện
    addEventListeners();

    // 3. Đăng ký Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('Đã đăng ký Service Worker.');
        } catch (error) {
            console.error('Đăng ký Service Worker thất bại:', error);
        }
    }

    // 4. Lấy dữ liệu từ vựng (từ Google Sheet) và "trí nhớ" (từ LocalStorage)
    await loadData();

    // 5. (ĐÃ XÓA) Không cần tự động đồng bộ
    // setInterval(syncProgressToSheet, 300000); 
}

// Gán tất cả sự kiện
function addEventListeners() {
    // Màn hình 1: Chọn chế độ
    modeAudioButton.addEventListener('click', () => selectGameMode('audio-only'));
    modeTextButton.addEventListener('click', () => selectGameMode('phonetic-text'));
    settingsButton.addEventListener('click', openSettingsModal);
    reloadButton.addEventListener('click', hardReloadApp); 

    // Màn hình 2: Chọn chủ đề
    topicBackButton.addEventListener('click', showModeSelectionScreen);

    // Màn hình 3: Game
    nextRoundButton.addEventListener('click', startNewRound);
    homeButton.addEventListener('click', () => window.location.reload()); 
    // (ĐÃ XÓA) Không cần sự kiện cho nút sync
    // syncButton.addEventListener('click', syncProgressToSheet); 

    // Modal Cài đặt
    settingsCloseButton.addEventListener('click', closeSettingsModal);
    clearCacheButton.addEventListener('click', clearAudioCache);
    statsButton.addEventListener('click', openStatsModal);
    // (MỚI) Thêm sự kiện cho nút xuất excel
    exportExcelButton.addEventListener('click', exportToExcel);

    // Modal Thống kê
    statsCloseButton.addEventListener('click', closeStatsModal);
}

// Hàm Tải lại ứng dụng (Gỡ Service Worker)
async function hardReloadApp() {
    showLoader(true, "Đang gỡ bỏ cache, vui lòng chờ...");
    try {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations.length) {
                for (const registration of registrations) {
                    await registration.unregister();
                    console.log('Đã gỡ Service Worker:', registration);
                }
            } else {
                console.log('Không tìm thấy Service Worker để gỡ.');
            }
        }
        
        // Đợi 1s để gỡ
        setTimeout(() => {
            window.location.reload();
        }, 1000);

    } catch (error) {
        console.error('Lỗi khi gỡ Service Worker, tải lại bình thường:', error);
        window.location.reload();
    }
}


// (CẬP NHẬT) Tải dữ liệu từ Google Sheet và LocalStorage
async function loadData() {
    try {
        // Kiểm tra URL đã được cài đặt chưa
        if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL === 'DÁN_URL_TRIỂN_KHAI_MỚI_CỦA_BẠN_VÀO_ĐÂY') {
             throw new Error('URL Apps Script chưa được cài đặt.');
        }
        
        // 1. Tải kho từ vựng từ Google Sheet (NHƯ CŨ)
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL);
        if (!response.ok) throw new Error('Không thể tải dữ liệu từ Google Sheet');
        const result = await response.json();
        
        if (!result.success || !result.data) throw new Error(result.error || 'Lỗi cấu trúc dữ liệu trả về');
        
        allWords = result.data; // Lưu kho từ vựng
        
        // 2. Tải "trí nhớ" từ LocalStorage (như cũ)
        progress = loadProgress();

        // 3. Đồng bộ "trí nhớ" (như cũ, nhưng giờ dùng data từ Sheet)
        // Đảm bảo mọi từ trên Sheet đều có trong "trí nhớ"
        syncProgress(allWords);

        // 4. Cập nhật UI khi SẴN SÀNG
        loadingStatus.textContent = "Sẵn sàng! Hãy chọn chế độ.";
        loadingStatus.style.color = "var(--correct-color)"; // Màu xanh
        
        // Bật các nút
        modeAudioButton.disabled = false;
        modeTextButton.disabled = false;

    } catch (error) {
        console.error("Lỗi khi khởi động:", error);
        loadingStatus.textContent = `Lỗi: ${error.message}. Vui lòng tải lại.`;
        loadingStatus.style.color = "var(--incorrect-color)"; // Màu đỏ
        alert(`Lỗi tải dữ liệu: ${error.message}. Hãy kiểm tra kết nối hoặc URL backend.`);
    }
}

// (ĐÃ XÓA) Không cần hàm getDefaultWords
// (ĐÃ XÓA) Không cần hàm saveAllWords

// Hiển thị màn hình 1
function showModeSelectionScreen() {
    modeSelectionOverlay.style.display = 'flex';
    topicSelectionOverlay.style.display = 'none';
    header.style.display = 'none';
    mainContent.style.display = 'none';
}

// Chọn chế độ (Màn 1 -> Màn 2)
function selectGameMode(mode) {
    gameMode = mode;
    modeSelectionOverlay.style.display = 'none';
    populateTopicList(); 
    topicSelectionOverlay.style.display = 'flex';
}

// TẠO DANH SÁCH CHỦ ĐỀ
function populateTopicList() {
    topicListContainer.innerHTML = ''; // Xóa danh sách cũ
    
    // 1. Lấy tất cả chủ đề
    const topics = new Set(allWords.map(word => word.topic || "Khác"));
    
    // 2. Tạo nút "Tất cả"
    const allButton = document.createElement('button');
    allButton.className = 'action-button';
    allButton.textContent = 'Tất cả';
    allButton.addEventListener('click', () => selectTopic('Tất cả'));
    topicListContainer.appendChild(allButton);
    
    // 3. Tạo nút cho mỗi chủ đề
    topics.forEach(topic => {
        const topicButton = document.createElement('button');
        topicButton.className = 'action-button';
        topicButton.textContent = topic;
        topicButton.addEventListener('click', () => selectTopic(topic));
        topicListContainer.appendChild(topicButton);
    });
}

// Chọn chủ đề (Màn 2 -> Màn 3)
function selectTopic(topic) {
    selectedTopic = topic;
    topicSelectionOverlay.style.display = 'none';
    header.style.display = 'flex';
    mainContent.style.display = 'block';
    startNewRound();
}

// (ĐÃ XÓA) Hàm syncProgressToSheet
// async function syncProgressToSheet() { ... }


// --- Logic SRS (Cốt lõi - Giữ nguyên) ---

function loadProgress() {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function saveProgress() {
    // Chỉ lưu 'progress' vào localStorage
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

// SyncProgress giờ nhận 'wordsFromSheet'
function syncProgress(wordsFromSheet) {
    // const today = getTodayString(); // Không cần today ở đây nữa
    let updated = false;
    
    // Đảm bảo mọi từ trong Sheet đều có trong "trí nhớ"
    for (const word of wordsFromSheet) {
        if (!progress[word.id]) {
            // Nếu từ này CHƯA có trong progress (localStorage)
            // Lấy dữ liệu (level, nextReview) từ Sheet làm mặc định
            progress[word.id] = {
                level: word.level, 
                nextReview: word.nextReview,
                phonetic: null // Phiên âm sẽ được tải khi cần
            };
            updated = true;
        } else if (typeof progress[word.id].phonetic === 'undefined') {
            // Đảm bảo các từ cũ (đã có trong progress) cũng có trường phiên âm
            progress[word.id].phonetic = null;
            updated = true;
        }
        // Nếu từ ĐÃ có trong progress, chúng ta KHÔNG làm gì cả
        // để giữ lại tiến độ đã lưu trong localStorage
    }
    
    if (updated) saveProgress();
}

function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

function getNextReviewDate(level) {
    const daysToAdd = SRS_LEVELS[level];
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split('T')[0];
}

// Lấy từ để ôn tập (theo Chủ đề)
function getWordsToReview(count = WORDS_PER_ROUND) {
    const today = getTodayString();
    
    // 1. Lọc 'allWords' theo chủ đề đã chọn
    const wordsInTopic = (selectedTopic === "Tất cả")
        ? allWords
        : allWords.filter(word => (word.topic || "Khác") === selectedTopic);

    if (wordsInTopic.length === 0) {
        return []; // Không có từ nào trong chủ đề này
    }

    // 2. Ưu tiên từ cần ôn tập (chỉ trong chủ đề này)
    // (QUAN TRỌNG) Lấy level/nextReview từ 'progress' (localStorage)
    const reviewQueue = wordsInTopic
        .filter(word => progress[word.id] && progress[word.id].nextReview <= today)
        .sort(() => Math.random() - 0.5);

    // 3. Lấy thêm từ mới (chỉ trong chủ đề này)
    const newQueue = wordsInTopic
        .filter(word => progress[word.id] && progress[word.id].level === 0 && !reviewQueue.find(w => w.id === word.id))
        .sort(() => Math.random() - 0.5);

    // 4. Kết hợp lại
    let wordsForRound = [...reviewQueue, ...newQueue];

    // 5. Nếu vẫn không đủ, lấy từ bất kỳ (chỉ trong chủ đề này)
    if (wordsForRound.length < count) {
        const extraWords = wordsInTopic
            .filter(word => !wordsForRound.find(w => w.id === word.id))
            .sort(() => Math.random() - 0.5);
        wordsForRound = [...wordsForRound, ...extraWords];
    }

    // Đảm bảo số lượng trả về không lớn hơn số từ trong chủ đề
    const finalCount = Math.min(count, wordsInTopic.length);
    return wordsForRound.slice(0, finalCount);
}

// Cập nhật tiến độ
function updateWordProgress(wordId, isCorrect) {
    if (!progress[wordId]) return;

    // Lấy level hiện tại từ 'progress'
    let currentLevel = progress[wordId].level;

    if (isCorrect) {
        currentLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    } else {
        currentLevel = Math.max(currentLevel - 1, 0);
    }

    // Cập nhật 'progress'
    progress[wordId].level = currentLevel;
    progress[wordId].nextReview = getNextReviewDate(currentLevel);
    
    // (ĐÃ XÓA) Không cập nhật 'allWords'
    // const wordInAllWords = allWords.find(w => w.id === wordId);
    // if (wordInAllWords) { ... }

    // Chỉ lưu 'progress' vào localStorage
    saveProgress(); 
}


// --- Logic Game (Giữ nguyên) ---

function startNewRound() {
    showLoader(false);
    nextRoundButton.style.display = 'none';
    gameContainer.style.opacity = 1;
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;

    // 1. Lấy từ để chơi
    currentWords = getWordsToReview();
    if (currentWords.length === 0) {
        if (allWords.length === 0) {
            gameTitle.textContent = "Lỗi tải dữ liệu";
        } else if (selectedTopic !== "Tất cả") {
             gameTitle.textContent = "Không có từ trong chủ đề này!";
        } else {
             gameTitle.textContent = "Bạn đã học hết từ!";
        }
        return;
    }
    
    // 2. TẢI TRƯỚC ÂM THANH VÀ PHIÊN ÂM (PRELOAD)
    showLoader(true, "Đang chuẩn bị dữ liệu...");
    preloadDataForRound(currentWords); 
    showLoader(false);

    // 3. Cập nhật tiêu đề game
    const modeTitle = gameMode === 'audio-only' ? "Nghe và nối" : "Đọc và nối";
    gameTitle.textContent = `${modeTitle} (${selectedTopic})`;

    // 4. Tạo thẻ
    const leftItems = currentWords.map(word => ({
        id: word.id,
        text: gameMode === 'audio-only' ? `🔊` : word.english,
        word: word.english,
        type: gameMode
    }));
    const rightItems = currentWords.map(word => ({
        id: word.id,
        text: word.vietnamese,
        type: 'text'
    }));

    shuffleArray(leftItems).forEach(item => leftColumn.appendChild(createCard(item, 'left')));
    shuffleArray(rightItems).forEach(item => rightColumn.appendChild(createCard(item, 'right')));

    updateProgress();
}

function createCard(item, side) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.side = side;
    card.dataset.word = item.word;

    // Luôn lấy phiên âm từ 'progress'
    const wordPhonetic = progress[item.id]?.phonetic;

    if (item.type === 'audio-only') {
        // CHẾ ĐỘ AUDIO (Thêm phiên âm)
        card.classList.add('audio-card');
        
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        
        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = '🔊'; // Icon loa
        cardContent.appendChild(wordEl);

        // Thêm phiên âm nếu có
        if (wordPhonetic) {
            const phoneticEl = document.createElement('div');
            phoneticEl.className = 'card-phonetic';
            phoneticEl.textContent = wordPhonetic;
            cardContent.appendChild(phoneticEl);
        }
        card.appendChild(cardContent);

    } else if (item.type === 'phonetic-text' && side === 'left') {
        // CHẾ ĐỘ TEXT (Bên trái) - Hiển thị Word + Phonetic
        card.classList.add('text-audio-card');
        
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        
        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = item.text;
        cardContent.appendChild(wordEl);

        if (wordPhonetic) {
            const phoneticEl = document.createElement('div');
            phoneticEl.className = 'card-phonetic';
            phoneticEl.textContent = wordPhonetic;
            cardContent.appendChild(phoneticEl);
        }
        card.appendChild(cardContent);

    } else {
        // CHẾ ĐỘ TEXT (Bên phải - Tiếng Việt)
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = item.text;
        cardContent.appendChild(wordEl);
        card.appendChild(cardContent);
    }
    
    card.addEventListener('click', handleCardClick);
    return card;
}


// Xử lý nhấn thẻ (Giữ nguyên)
function handleCardClick(event) {
    const selectedCard = event.currentTarget;
    
    if (isChecking || selectedCard.classList.contains('disabled') || selectedCard.classList.contains('correct')) return;

    const side = selectedCard.dataset.side;

    if (side === 'left') {
        playAudio(selectedCard.dataset.word);
    }

    if (side === 'left' && selectedCard === selectedLeft) {
        selectedLeft.classList.remove('selected');
        selectedLeft = null;
        return;
    }
    if (side === 'right' && selectedCard === selectedRight) {
        selectedRight.classList.remove('selected');
        selectedRight = null;
        return;
    }

    selectedCard.classList.add('selected');
    if (side === 'left') {
        if (selectedLeft) selectedLeft.classList.remove('selected');
        selectedLeft = selectedCard;
    } else {
        if (selectedRight) selectedRight.classList.remove('selected');
        selectedRight = selectedCard;
    }

    if (selectedLeft && selectedRight) {
        checkMatch();
    }
}

// Kiểm tra (Giữ nguyên)
function checkMatch() {
    const isMatch = selectedLeft.dataset.id === selectedRight.dataset.id;
    const wordId = selectedLeft.dataset.id;

    selectedLeft.classList.add('disabled');
    selectedRight.classList.add('disabled');

    if (isMatch) {
        selectedLeft.classList.add('correct');
        selectedRight.classList.add('correct');
        correctPairs++;
        totalScore += 10;
        updateWordProgress(wordId, true); // Lưu vào localStorage

        if (correctPairs === currentWords.length) {
            gameContainer.style.opacity = 0.5;
            nextRoundButton.style.display = 'block';
        }
        
        selectedLeft = null;
        selectedRight = null;
    } else {
        isChecking = true; 
        
        selectedLeft.classList.add('incorrect');
        selectedRight.classList.add('incorrect');
        totalScore = Math.max(0, totalScore - 5);
        updateWordProgress(wordId, false); // Lưu vào localStorage

        setTimeout(() => {
            selectedLeft.classList.remove('incorrect', 'selected', 'disabled');
            selectedRight.classList.remove('incorrect', 'selected', 'disabled');
            selectedLeft = null;
            selectedRight = null;
            isChecking = false; 
        }, 1000); 
    }
}

// Cập nhật thanh tiến trình (Giữ nguyên)
function updateProgress() {
    const progressPercent = (correctPairs / currentWords.length) * 100;
    progressBar.style.width = `${progressPercent}%`;
    scoreDisplay.textContent = totalScore;
}

// --- Các hàm hỗ trợ (Đã cập nhật) ---

// (CẬP NHẬT) Xuất dữ liệu ra Excel
function exportToExcel() {
    console.log("Đang chuẩn bị xuất Excel...");
    showLoader(true, "Đang xuất dữ liệu...");

    try {
        // 1. Chuẩn bị dữ liệu
        // Lấy dữ liệu tĩnh từ 'allWords' (từ Sheet)
        // Lấy dữ liệu động (level, review, phonetic) từ 'progress' (từ localStorage)
        const dataToExport = allWords.map(word => {
            const progressData = progress[word.id] || {}; // Lấy tiến độ từ localStorage
            return {
                "ID": word.id,
                "English": word.english,
                "Vietnamese": word.vietnamese,
                "Topic": word.topic || "Khác",
                "Level": progressData.level, // Lấy level TỪ PROGRESS
                "NextReviewDate": progressData.nextReview, // Lấy ngày ôn TỪ PROGRESS
                "Phonetic": progressData.phonetic || "" // Lấy phiên âm TỪ PROGRESS
            };
        });

        // 2. Tạo worksheet từ JSON
        const ws = XLSX.utils.json_to_sheet(dataToExport);

        // 3. Tạo workbook mới và thêm worksheet vào
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "VocabProgress");

        // 4. Ghi file và kích hoạt tải về
        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Vocab_Export_${today}.xlsx`);

        showLoader(true, "Xuất thành công!");
        setTimeout(() => { showLoader(false); closeSettingsModal(); }, 1500);

    } catch (error) {
        console.error("Lỗi khi xuất Excel:", error);
        showLoader(true, "Lỗi khi xuất file!");
        setTimeout(() => { showLoader(false); }, 2000);
    }
}


// Xóa cache âm thanh (Giữ nguyên)
async function clearAudioCache() {
    console.log('Đang xóa cache âm thanh theo yêu cầu...');
    showLoader(true, "Đang xóa cache âm thanh...");
    try {
        await caches.delete(AUDIO_CACHE_NAME);
        console.log('Đã xóa cache âm thanh thành công.');
        await caches.open(AUDIO_CACHE_NAME); 
        
        showLoader(true, "Đã xóa xong!");
        setTimeout(() => { showLoader(false); }, 1500); 
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
        showLoader(true, "Xóa cache thất bại!");
        setTimeout(() => { showLoader(false); }, 2000);
    }
}

// Chuẩn hóa từ (Giữ nguyên)
function normalizeWord(word) {
    if (!word) return "";
    return word.trim().toLowerCase();
}

// Tải trước (Giữ nguyên)
function preloadDataForRound(words) {
    console.log(`Đang tải trước dữ liệu cho ${words.length} từ...`);
    words.forEach(word => {
        if (!word.english) return;
        fetchAndCacheWordData(word.english, word.id, null, false); 
    });
}

// Phát âm thanh (Giữ nguyên)
async function playAudio(word) {
    if (!word) return;
    
    const audioButton = document.querySelector(`.card[data-word="${word}"][data-side="left"]`);
    if (audioButton) audioButton.classList.add('selected'); 

    // Lấy wordId từ allWords
    const wordData = allWords.find(w => w.english === word);
    if (!wordData) {
        console.error(`Không tìm thấy wordData cho: ${word}`);
        return;
    }

    fetchAndCacheWordData(word, wordData.id, audioButton, true);
}

// Lấy ÂM THANH và PHIÊN ÂM (Giữ nguyên)
async function fetchAndCacheWordData(word, wordId, audioButtonElement, shouldPlay) {
    let normalizedWord = normalizeWord(word);
    if (!normalizedWord) return;

    // Xử lý Động từ Bất quy tắc (chỉ lấy từ đầu tiên)
    if (normalizedWord.includes('-') || normalizedWord.split(' ').length > 2) {
        normalizedWord = normalizedWord.split(/[\s-]+/)[0];
    }

    // 1. Kiểm tra xem đã có đủ dữ liệu chưa
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const hasPhonetic = progress[wordId]?.phonetic;
    
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${normalizedWord}`);
        if (!response.ok) throw new Error('Không tìm thấy từ (404)');
        
        const data = await response.json();
        
        let audioUrl = "";
        let phoneticText = hasPhonetic ? progress[wordId].phonetic : null;

        if (data[0] && data[0].phonetics) {
            let phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "" && p.text);
            if (!phoneticData) {
                phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "");
            }
            if (!phoneticData && !hasPhonetic) {
                const textOnlyPhonetic = data[0].phonetics.find(p => p.text);
                if(textOnlyPhonetic) phoneticText = textOnlyPhonetic.text;
            }

            if (phoneticData) {
                if (!phoneticText && phoneticData.text) {
                    phoneticText = phoneticData.text;
                }
                if(phoneticData.audio) {
                    audioUrl = phoneticData.audio;
                    if (audioUrl.startsWith("//")) {
                        audioUrl = "https" + audioUrl;
                    }
                }
            }
        }
        
        if (phoneticText && !hasPhonetic) {
            progress[wordId].phonetic = phoneticText;
            saveProgress();
            
            // Cập nhật giao diện nếu thẻ đã được vẽ (cho preload)
            const cardEl = document.querySelector(`.card[data-id="${wordId}"] .card-content`);
            if (cardEl && !cardEl.querySelector('.card-phonetic')) {
                const phoneticEl = document.createElement('div');
                phoneticEl.className = 'card-phonetic';
                phoneticEl.textContent = phoneticText;
                cardEl.appendChild(phoneticEl);
            }
        }


        if (audioUrl) {
            let cachedResponse = await cache.match(audioUrl);
            let audioBlob;

            if (cachedResponse) {
                if (shouldPlay) console.log(`[Cache] Đã tìm thấy ${normalizedWord}.`);
                audioBlob = await cachedResponse.blob();
            } else {
                console.log(`[Network] Đang tải ${normalizedWord}, sẽ lưu vào cache...`);
                const networkResponse = await fetch(audioUrl);
                if (!networkResponse.ok) throw new Error('Không thể tải file MP3');
                await cache.put(audioUrl, networkResponse.clone());
                audioBlob = await networkResponse.blob();
            }

            if (shouldPlay) {
                const objectUrl = URL.createObjectURL(audioBlob);
                playAudioFromUrl(objectUrl, audioButtonElement);
            }

        } else {
            if (shouldPlay) {
                console.warn(`Không tìm thấy audio URL cho từ: ${normalizedWord}`);
                if (audioButtonElement) {
                    const originalHTML = audioButtonElement.innerHTML;
                    audioButtonElement.innerHTML = "Không có audio";
                    audioButtonElement.classList.remove('selected');
                    setTimeout(() => {
                        audioButtonElement.innerHTML = originalHTML;
                    }, 1500);
                }
            }
        }

    } catch (error) {
        console.error(`Lỗi khi xử lý dữ liệu cho ${word}:`, error);
        if (shouldPlay && audioButtonElement && audioButtonElement !== selectedLeft) {
            audioButtonElement.classList.remove('selected');
        }
    }
}


// Phát audio (Giữ nguyên)
function playAudioFromUrl(url, audioButton) {
    const audio = new Audio(url);
    
    audio.onended = () => {
        if (audioButton && audioButton !== selectedLeft) {
            audioButton.classList.remove('selected');
        }
        URL.revokeObjectURL(url);
    };
    
    audio.onerror = () => {
        console.error("Lỗi khi phát file audio.");
        if (audioButton && audioButton !== selectedLeft) {
            audioButton.classList.remove('selected');
        }
        URL.revokeObjectURL(url);
    };

    audio.play();
}

// Hiển thị Loader (Giữ nguyên)
function showLoader(show, message = "Đang tải...") {
    if (!loader) return;
    loaderText.textContent = message;
    loader.style.display = show ? 'flex' : 'none';
}

// Xáo trộn mảng (Giữ nguyên)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Mở Modal Cài đặt
function openSettingsModal() {
    settingsModal.style.display = 'flex';
}
function closeSettingsModal() {
    settingsModal.style.display = 'none';
}

// Mở Modal Thống kê
function openStatsModal() {
    populateStatsList(); // Tạo danh sách
    statsModal.style.display = 'flex';
}
function closeStatsModal() {
    statsModal.style.display = 'none';
}

// (CẬP NHẬT) Tạo danh sách Thống kê
function populateStatsList() {
    statsListContainer.innerHTML = ''; // Xóa cũ
    
    // 1. Lấy tất cả từ trong 'allWords' và 'progress'
    const wordsFromProgress = allWords.map(word => {
        const progressData = progress[word.id] || {}; // Lấy tiến độ từ localStorage
        return {
            id: word.id,
            english: word.english || "Không rõ",
            vietnamese: word.vietnamese || "Không rõ",
            level: progressData.level, // Lấy level TỪ PROGRESS
            phonetic: progressData.phonetic || "" // Lấy phiên âm TỪ PROGRESS
        };
    });
    
    // 2. Sắp xếp: Level cao nhất (đã thuộc) xuống thấp nhất (mới học)
    wordsFromProgress.sort((a, b) => b.level - a.level);
    
    // 3. Tạo HTML
    wordsFromProgress.forEach(word => {
        const item = document.createElement('div');
        item.className = 'stat-item';
        item.dataset.word = word.english; 
        
        const phoneticDisplay = word.phonetic ? ` - <span class="card-phonetic">${word.phonetic}</span>` : "";

        item.innerHTML = `
            <div class="stat-word">
                <div>${word.english}${phoneticDisplay}</div> 
                <div class="card-phonetic" style="color: #555;">${word.vietnamese}</div>
            </div>
            <span class="stat-level stat-level-${word.level}">Level ${word.level}</span>
        `;
        
        item.addEventListener('click', handleStatItemClick);
        
        statsListContainer.appendChild(item);
    });
}

// Xử lý nhấn vào mục Thống kê để phát âm
function handleStatItemClick(event) {
    const wordToPlay = event.currentTarget.dataset.word;
    if (wordToPlay) {
        playAudio(wordToPlay);
    }
}