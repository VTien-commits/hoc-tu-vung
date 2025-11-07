// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (GOOGLE SHEETS + LOCALSTORAGE)
// ***********************************************

// --- Cài đặt Chung ---
// !!! QUAN TRỌNG: Dán URL Ứng dụng web Google Apps Script của bạn vào đây
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxshuYRDZZUNwoOOG1_ME3tFO6RljsmvImNRFv35WgDkODRLqx-jaz0EaEXTGR6Wwiq/exec'; 

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
let selectedTopic = "Tất cả"; // (MỚI) Chủ đề đang chơi

// --- DOM Elements ---
let gameContainer, leftColumn, rightColumn, progressBar, scoreDisplay, nextRoundButton, loader, loaderText, gameTitle, clearCacheButton;
let modeSelectionOverlay, modeAudioButton, modeTextButton, loadingStatus;
let header, mainContent;
let topicSelectionOverlay, topicListContainer, topicBackButton; // (MỚI) Chọn chủ đề
let settingsModal, settingsButton, settingsCloseButton, statsButton, homeButton, reloadButton; // (MỚI) Cài đặt, (THÊM reloadButton)
let statsModal, statsCloseButton, statsListContainer; // (MỚI) Thống kê


// --- Khởi động ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    
    // 1. Gán giá trị cho DOM Elements
    // (Phần này sẽ gán tất cả các biến đã khai báo ở trên)
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

    // Modal Cài đặt
    settingsModal = document.getElementById('settings-modal');
    settingsCloseButton = document.getElementById('settings-close-button');
    statsButton = document.getElementById('stats-button');
    clearCacheButton = document.getElementById('clear-cache-button');
    reloadButton = document.getElementById('reload-button'); // (MỚI) Thêm nút reload

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
}

// (MỚI) Gán tất cả sự kiện
function addEventListeners() {
    // Màn hình 1: Chọn chế độ
    modeAudioButton.addEventListener('click', () => selectGameMode('audio-only'));
    modeTextButton.addEventListener('click', () => selectGameMode('phonetic-text'));

    // Màn hình 2: Chọn chủ đề
    topicBackButton.addEventListener('click', showModeSelectionScreen);

    // Màn hình 3: Game
    nextRoundButton.addEventListener('click', startNewRound);
    homeButton.addEventListener('click', goHomeAndSync); // (MỚI) Về Home và Đồng bộ
    settingsButton.addEventListener('click', openSettingsModal);

    // Modal Cài đặt
    settingsCloseButton.addEventListener('click', closeSettingsModal);
    clearCacheButton.addEventListener('click', clearAudioCache);
    statsButton.addEventListener('click', openStatsModal);
    reloadButton.addEventListener('click', () => window.location.reload()); // (MỚI) Thêm sự kiện click

    // Modal Thống kê
    statsCloseButton.addEventListener('click', closeStatsModal);
}

// (MỚI) Tải dữ liệu từ Google Sheet và LocalStorage
async function loadData() {
    try {
        // Kiểm tra URL đã được cài đặt chưa
        if (GOOGLE_APPS_SCRIPT_URL === 'DÁN_URL_GOOGLE_APPS_SCRIPT_CỦA_BÁN_VÀO_ĐÂY') {
             throw new Error('URL Apps Script chưa được cài đặt.');
        }
        
        // 1. Tải kho từ vựng từ Google Sheet
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
    }
}

// (MỚI) Hiển thị màn hình 1
function showModeSelectionScreen() {
    modeSelectionOverlay.style.display = 'flex';
    topicSelectionOverlay.style.display = 'none';
    header.style.display = 'none';
    mainContent.style.display = 'none';
}

// (MỚI) Chọn chế độ (Màn 1 -> Màn 2)
function selectGameMode(mode) {
    gameMode = mode;
    
    // Ẩn màn 1
    modeSelectionOverlay.style.display = 'none';
    
    // Hiển thị màn 2 (Chọn chủ đề)
    populateTopicList(); // Tạo danh sách chủ đề
    topicSelectionOverlay.style.display = 'flex';
}

// (MỚI) Tạo danh sách chủ đề (Màn 2)
function populateTopicList() {
    topicListContainer.innerHTML = ''; // Xóa danh sách cũ
    
    // Lấy các chủ đề độc nhất từ 'allWords'
    const topics = [...new Set(allWords.map(word => word.topic || "Khác"))];
    
    // Sắp xếp
    topics.sort();
    
    // Thêm nút "Tất cả"
    const allButton = document.createElement('button');
    allButton.className = 'action-button';
    allButton.textContent = `Tất cả (${allWords.length} từ)`;
    allButton.addEventListener('click', () => selectTopic('Tất cả'));
    topicListContainer.appendChild(allButton);

    // Thêm nút cho từng chủ đề
    topics.forEach(topic => {
        const count = allWords.filter(w => (w.topic || "Khác") === topic).length;
        const button = document.createElement('button');
        button.className = 'action-button secondary-button'; // Màu khác
        button.textContent = `${topic} (${count} từ)`;
        button.addEventListener('click', () => selectTopic(topic));
        topicListContainer.appendChild(button);
    });
}

// (MỚI) Chọn chủ đề (Màn 2 -> Màn 3)
function selectTopic(topic) {
    selectedTopic = topic;
    
    // Ẩn màn 2
    topicSelectionOverlay.style.display = 'none';
    
    // Hiển thị giao diện game chính (Màn 3)
    header.style.display = 'flex';
    mainContent.style.display = 'block';
    
    // Bắt đầu màn đầu tiên
    startNewRound();
}

// (MỚI) Về Home và Đồng bộ
async function goHomeAndSync() {
    // 1. Hiển thị loader thông báo
    showLoader(true, "Đang đồng bộ tiến độ...");
    
    try {
        // 2. Gửi 'progress' (từ localStorage) lên Google Apps Script (dùng POST)
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(progress), // Gửi toàn bộ "trí nhớ"
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`Đồng bộ thành công ${result.updated} từ.`);
            showLoader(true, "Đồng bộ thành công!");
        } else {
            throw new Error(result.error || "Lỗi đồng bộ không xác định");
        }
        
    } catch (error) {
        console.error("Lỗi khi đồng bộ:", error);
        showLoader(true, "Lỗi đồng bộ! Tiến độ chưa được lưu.");
    }

    // 3. Đợi 1.5s rồi tải lại trang
    setTimeout(() => {
        // Tải lại ứng dụng để về màn hình chính
        window.location.reload(); 
    }, 1500);
}


// --- Logic SRS (Cốt lõi - Giữ nguyên) ---

function loadProgress() {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function saveProgress() {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

// (CẬP NHẬT) SyncProgress giờ nhận 'allWords' làm tham số
function syncProgress(wordsFromSheet) {
    const today = getTodayString();
    let updated = false;
    
    // Đảm bảo mọi từ trong Sheet đều có trong "trí nhớ"
    for (const word of wordsFromSheet) {
        if (!progress[word.id]) {
            progress[word.id] = {
                level: word.level, // (MỚI) Lấy level từ Sheet
                nextReview: word.nextReview, // (MỚI) Lấy ngày ôn từ Sheet
                phonetic: null // Phiên âm sẽ được tải khi cần
            };
            updated = true;
        } else if (typeof progress[word.id].phonetic === 'undefined') {
            progress[word.id].phonetic = null;
            updated = true;
        }
    }
    // (Sau này có thể thêm: Xóa các từ trong 'progress' mà không còn trên Sheet)
    
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

// (CẬP NHẬT) Lấy từ để ôn tập (theo Chủ đề)
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

// Cập nhật tiến độ (Giữ nguyên)
function updateWordProgress(wordId, isCorrect) {
    if (!progress[wordId]) return;

    let currentLevel = progress[wordId].level;

    if (isCorrect) {
        currentLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    } else {
        currentLevel = Math.max(currentLevel - 1, 0);
    }

    progress[wordId].level = currentLevel;
    progress[wordId].nextReview = getNextReviewDate(currentLevel);
    
    saveProgress(); // Lưu ngay vào localStorage
}


// --- Logic Game (Đã cập nhật) ---

function startNewRound() {
    showLoader(false);
    nextRoundButton.style.display = 'none';
    gameContainer.style.opacity = 1;
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;

    // 1. Lấy từ theo logic SRS (đã lọc theo chủ đề)
    currentWords = getWordsToReview(WORDS_PER_ROUND); 
    
    if (currentWords.length === 0) {
        gameTitle.textContent = "Không có từ vựng!";
        if (selectedTopic !== "Tất cả" && allWords.length > 0) {
            gameTitle.textContent = `Không có từ trong chủ đề "${selectedTopic}"`;
        } else if (allWords.length === 0) {
            gameTitle.textContent = "Lỗi tải dữ liệu";
        } else {
             gameTitle.textContent = "Bạn đã học hết từ!";
        }
        return;
    }
    
    // 2. TẢI TRƯỚC ÂM THANH VÀ PHIÊN ÂM (PRELOAD)
    showLoader(true, "Đang chuẩn bị dữ liệu...");
    // (async/await không cần thiết ở đây nếu hàm preload không trả về promise)
    preloadDataForRound(currentWords); // Đổi tên hàm
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

// Tạo thẻ (Giữ nguyên)
function createCard(item, side) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.side = side;
    card.dataset.word = item.word;

    if (item.type === 'audio-only') {
        card.classList.add('audio-card');
        card.textContent = '🔊';
    } else if (item.type === 'phonetic-text' && side === 'left') {
        card.classList.add('text-audio-card');
        const wordPhonetic = progress[item.id]?.phonetic;
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
    if (selectedCard.classList.contains('disabled') || selectedCard.classList.contains('correct')) return;

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
    } else {
        selectedLeft.classList.add('incorrect');
        selectedRight.classList.add('incorrect');
        totalScore = Math.max(0, totalScore - 5);
        updateWordProgress(wordId, false); // Lưu vào localStorage

        setTimeout(() => {
            selectedLeft.classList.remove('incorrect', 'selected', 'disabled');
            selectedRight.classList.remove('incorrect', 'selected', 'disabled');
            selectedLeft = null;
            selectedRight = null;
        }, 1000); // <-- Thời gian 1 giây
    }

    if (isMatch) {
        selectedLeft = null;
        selectedRight = null;
    }

    updateProgress();
}

// Cập nhật thanh tiến trình (Giữ nguyên)
function updateProgress() {
    const progressPercent = (correctPairs / currentWords.length) * 100;
    progressBar.style.width = `${progressPercent}%`;
    scoreDisplay.textContent = totalScore;
}


// --- (MỚI) Modal Cài đặt & Thống kê ---

function openSettingsModal() {
    settingsModal.style.display = 'flex';
}
function closeSettingsModal() {
    settingsModal.style.display = 'none';
}
function openStatsModal() {
    populateStatsList(); // Tạo danh sách thống kê
    statsModal.style.display = 'flex';
}
function closeStatsModal() {
    statsModal.style.display = 'none';
}

// (MỚI) Tạo danh sách thống kê
function populateStatsList() {
    statsListContainer.innerHTML = ''; // Xóa cũ
    
    // 1. Tạo một mảng từ 'allWords'
    // 2. Map nó với 'progress'
    // 3. Sắp xếp theo level (cao -> thấp)
    const statsData = allWords.map(word => ({
        id: word.id,
        english: word.english,
        vietnamese: word.vietnamese,
        level: progress[word.id]?.level || 0 // Lấy level từ 'progress'
    })).sort((a, b) => b.level - a.level); // Sắp xếp giảm dần

    // 4. Tạo HTML
    statsData.forEach(item => {
        const div = document.createElement('div');
        div.className = 'stat-item';
        
        const wordInfo = document.createElement('div');
        wordInfo.className = 'stat-word-info';
        
        const wordEn = document.createElement('div');
        wordEn.className = 'stat-word';
        wordEn.textContent = item.english;
        
        const wordVi = document.createElement('div');
        wordVi.className = 'card-phonetic'; // Dùng lại style
        wordVi.textContent = item.vietnamese;
        
        wordInfo.appendChild(wordEn);
        wordInfo.appendChild(wordVi);
        
        const levelBadge = document.createElement('div');
        levelBadge.className = `stat-level stat-level-${item.level}`;
        levelBadge.textContent = `Level ${item.level}`;
        
        div.appendChild(wordInfo);
        div.appendChild(levelBadge);
        statsListContainer.appendChild(div);
    });
}


// --- Các hàm hỗ trợ (Tải âm thanh) ---

async function clearAudioCache() {
    console.log('Đang xóa cache âm thanh theo yêu cầu...');
    showLoader(true, "Đang xóa cache âm thanh...");
    try {
        await caches.delete(AUDIO_CACHE_NAME);
        console.log('Đã xóa cache âm thanh thành công.');
        await caches.open(AUDIO_CACHE_NAME); // Mở lại cache rỗng
        showLoader(true, "Đã xóa xong!");
        setTimeout(() => {
            showLoader(false);
            closeSettingsModal(); // Đóng modal sau khi xóa
        }, 1500); 
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
        showLoader(true, "Xóa cache thất bại!");
        setTimeout(() => {
            showLoader(false);
        }, 2000);
    }
}

function normalizeWord(word) {
    if (!word) return "";
    return word.trim().toLowerCase();
}

// (CẬP NHẬT) Tải trước (preload) - Giờ không cần async/await
function preloadDataForRound(words) {
    console.log(`Đang tải trước dữ liệu cho ${words.length} từ...`);
    words.forEach(word => {
        if (!word.english) return;
        // Gọi hàm fetch, không phát (shouldPlay = false)
        fetchAndCacheWordData(word.english, word.id, null, false); 
    });
    console.log("Đã kích hoạt tải trước (chạy nền).");
}

async function playAudio(word) {
    if (!word) return;
    const audioButton = document.querySelector(`.card[data-word="${word}"][data-side="left"]`);
    if (audioButton) audioButton.classList.add('selected'); 

    const wordData = allWords.find(w => w.english === word);
    if (!wordData) {
        console.error(`Không tìm thấy wordData cho: ${word}`);
        return;
    }
    fetchAndCacheWordData(word, wordData.id, audioButton, true);
}

// (CẬP NHẬT) Lấy ÂM THANH và PHIÊN ÂM
async function fetchAndCacheWordData(word, wordId, audioButtonElement, shouldPlay) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return;

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
            
            // CẬP NHẬT TRỰC TIẾP (MỚI)
            // Nếu thẻ đang được hiển thị, cập nhật phiên âm ngay lập tức
            const cardToUpdate = document.querySelector(`.card[data-id="${wordId}"] .card-content`);
            if (cardToUpdate && !cardToUpdate.querySelector('.card-phonetic')) {
                const phoneticEl = document.createElement('div');
                phoneticEl.className = 'card-phonetic';
                phoneticEl.textContent = phoneticText;
                cardToUpdate.appendChild(phoneticEl);
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

function showLoader(show, message = "Đang tải...") {
    if (!loader) return;
    loaderText.textContent = message;
    loader.style.display = show ? 'flex' : 'none';
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}