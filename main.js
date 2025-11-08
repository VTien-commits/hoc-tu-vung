// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (GOOGLE SHEETS + LOCALSTORAGE)
// ***********************************************

// --- Cài đặt Chung ---
// !!! QUAN TRỌNG: Dán URL Ứng dụng web Google Apps Script của bạn vào đây
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxshuYRDZZUNwoOOG1_ME3tFO6RljsmvImNRFv35WgDkODRLqx-jaz0EaEXTGR6Wwiq/exec'; 

// (MỚI) Đường dẫn tới thư mục ảnh trên GitHub
// (Nó sẽ tự động tìm trong thư mục 'images' cùng cấp với index.html)
const IMAGE_BASE_PATH = 'images/';

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
let isChecking = false; // (MỚI) Thêm biến "khóa" để chống lỗi race condition

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
    settingsButton.addEventListener('click', openSettingsModal); // (CẬP NHẬT) Nút cài đặt giờ ở màn hình 1
    reloadButton.addEventListener('click', () => window.location.reload()); 

    // Màn hình 2: Chọn chủ đề
    topicBackButton.addEventListener('click', showModeSelectionScreen);

    // Màn hình 3: Game
    nextRoundButton.addEventListener('click', startNewRound);
    homeButton.addEventListener('click', goHomeAndSync); // (MỚI) Về Home và Đồng bộ
    // settingsButton.addEventListener('click', openSettingsModal); // (ĐÃ XÓA) Sự kiện này giờ được gán ở Màn 1

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
        // CHẾ ĐỘ AUDIO (Bên trái)
        card.classList.add('audio-card');
        card.textContent = '🔊';
    } else if (item.type === 'phonetic-text' && side === 'left') {
        // (CẬP NHẬT) CHẾ ĐỘ TEXT (Bên trái) - Hiển thị [Chữ + Phiên âm | Ảnh]
        card.classList.add('text-audio-card');
        const wordPhonetic = progress[item.id]?.phonetic;
        
        // 1. Tạo cấu trúc (wrapper)
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'card-with-image'; // Class mới cho Flexbox

        // 2. Tạo phần chữ (Word + Phonetic)
        const textContentDiv = document.createElement('div');
        textContentDiv.className = 'card-text-content'; // Class mới

        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = item.text;
        textContentDiv.appendChild(wordEl);

        if (wordPhonetic) {
            const phoneticEl = document.createElement('div');
            phoneticEl.className = 'card-phonetic';
            phoneticEl.textContent = wordPhonetic;
            textContentDiv.appendChild(phoneticEl);
        }
        
        // 3. Tạo phần ảnh
        const imageContainerDiv = document.createElement('div');
        imageContainerDiv.className = 'card-image-container'; // Class mới
        
        const imgEl = document.createElement('img');
        imgEl.src = formatWordForImageName(item.word); // Tự động tạo link ảnh
        
        // Tự động ẩn nếu không tìm thấy ảnh
        imgEl.onerror = function() { 
            this.style.display = 'none'; 
            // Nếu ảnh lỗi, căn giữa lại phần chữ
            wrapperDiv.style.justifyContent = 'center'; 
        };
        
        imageContainerDiv.appendChild(imgEl);

        // 4. Gắn vào thẻ
        wrapperDiv.appendChild(textContentDiv);
        wrapperDiv.appendChild(imageContainerDiv);
        card.appendChild(wrapperDiv);

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
    
    // (CẬP NHẬT) Nếu đang check hoặc thẻ đã bị khóa/đúng, không làm gì cả
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

// (MỚI) Hàm định dạng tên ảnh
// Ví dụ: "living room" -> "images/living_room.png"
// "go-went-gone" -> "images/go_went_gone.png"
function formatWordForImageName(word) {
    if (!word) return "";
    // Thay thế dấu cách, dấu gạch ngang bằng gạch dưới
    const imageName = word.toLowerCase().replace(/[\s-]+/g, '_'); 
    return `${IMAGE_BASE_PATH}${imageName}.png`;
}

// Hàm xáo trộn mảng
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}