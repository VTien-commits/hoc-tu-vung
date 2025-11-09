// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (Tải từ Google Sheet + Lưu vào LocalStorage)
// ***********************************************

// --- Cài đặt Chung ---
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyOeRAjUsPpgizXQOpuFnuElYQ7ZWwxUZJilRnymmcuCafZ965a1fPiEzVx5l_tP6c/exec'; 

// (MỚI) Thêm cache cho từ vựng
const ALL_WORDS_CACHE_KEY = 'vocabAppAllWordsCache';
const PROGRESS_STORAGE_KEY = 'vocabAppProgress'; 
const TIMER_SETTING_KEY = 'vocabAppTimer'; // (MỚI) Khóa lưu cài đặt timer
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const WORDS_PER_ROUND = 6; 

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

// (MỚI) Biến cho Timer
let timerInterval = null;
let countdownTime = 60; // Mặc định 60s

// --- DOM Elements ---
let gameContainer, leftColumn, rightColumn, progressBar, scoreDisplay, nextRoundButton, loader, loaderText, gameTitle, clearCacheButton;
let modeSelectionOverlay, modeAudioButton, modeTextButton;
// (ĐÃ XÓA) loadingStatus
let header, mainContent;
let topicSelectionOverlay, topicListContainer, topicBackButton; 
let settingsModal, settingsButton, settingsCloseButton, statsButton, homeButton, reloadButton; 
let exportExcelButton;
let statsModal, statsCloseButton, statsListContainer; 

// (MỚI) Các DOM element mới
let timerDisplay, timerSettingInput;
let loadOnlineButton, loadOnlineStatus;
let statsTopicFilter;
let resetProgressButton, confirmResetModal, confirmResetCancel, confirmResetConfirm;


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
    // (ĐÃ XÓA) loadingStatus

    // Màn hình 2: Chọn chủ đề
    topicSelectionOverlay = document.getElementById('topic-selection-overlay');
    topicListContainer = document.getElementById('topic-list'); 
    topicBackButton = document.getElementById('topic-back-button');

    // Màn hình 3: Các nút Header
    homeButton = document.getElementById('home-button');
    settingsButton = document.getElementById('settings-button');

    // (MỚI) Timer
    timerDisplay = document.getElementById('timer');

    // Modal Cài đặt
    settingsModal = document.getElementById('settings-modal');
    settingsCloseButton = document.getElementById('settings-close-button');
    statsButton = document.getElementById('stats-button');
    clearCacheButton = document.getElementById('clear-cache-button');
    reloadButton = document.getElementById('reload-button');
    exportExcelButton = document.getElementById('export-excel-button');
    
    // (MỚI) Cài đặt
    timerSettingInput = document.getElementById('timer-setting');
    loadOnlineButton = document.getElementById('load-online-button');
    loadOnlineStatus = document.getElementById('load-online-status');
    resetProgressButton = document.getElementById('reset-progress-button');

    // Modal Thống kê
    statsModal = document.getElementById('stats-modal');
    statsCloseButton = document.getElementById('stats-close-button');
    statsListContainer = document.getElementById('stats-list');
    statsTopicFilter = document.getElementById('stats-topic-filter'); // (MỚI)

    // (MỚI) Modal Xác nhận
    confirmResetModal = document.getElementById('confirm-reset-modal');
    confirmResetCancel = document.getElementById('confirm-reset-cancel');
    confirmResetConfirm = document.getElementById('confirm-reset-confirm');

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

    // 4. (CẬP NHẬT) Tải dữ liệu từ Cache trước, sau đó fetch ngầm
    
    // Tải tiến độ (sync)
    progress = loadProgress();
    
    // Tải cài đặt timer (sync)
    countdownTime = localStorage.getItem(TIMER_SETTING_KEY) || 60;
    timerSettingInput.value = countdownTime;

    // Tải từ vựng từ cache (sync)
    allWords = loadAllWordsCache();

    if (allWords.length > 0) {
        // Nếu có cache, cho phép chơi ngay
        syncProgress(allWords); // Đồng bộ cache từ vựng và cache tiến độ
        modeAudioButton.disabled = false;
        modeTextButton.disabled = false;
    }

    // Tải ngầm dữ liệu mới từ Google Sheet
    await loadDataOnline(false); // (false = không phải do người dùng nhấn)
}

// Gán tất cả sự kiện
function addEventListeners() {
    // Màn hình 1
    modeAudioButton.addEventListener('click', () => selectGameMode('audio-only'));
    modeTextButton.addEventListener('click', () => selectGameMode('phonetic-text'));
    settingsButton.addEventListener('click', openSettingsModal);
    reloadButton.addEventListener('click', hardReloadApp); 

    // Màn hình 2
    topicBackButton.addEventListener('click', showModeSelectionScreen);

    // Màn hình 3
    nextRoundButton.addEventListener('click', startNewRound); // Sẽ bị ghi đè khi chơi lại
    homeButton.addEventListener('click', () => window.location.reload()); 

    // Modal Cài đặt
    settingsCloseButton.addEventListener('click', closeSettingsModal);
    clearCacheButton.addEventListener('click', clearAudioCache);
    statsButton.addEventListener('click', openStatsModal);
    exportExcelButton.addEventListener('click', exportToExcel);
    
    // (MỚI) Sự kiện cài đặt
    timerSettingInput.addEventListener('change', saveTimerSetting);
    loadOnlineButton.addEventListener('click', () => loadDataOnline(true)); // (true = do người dùng nhấn)
    resetProgressButton.addEventListener('click', openConfirmResetModal);

    // Modal Thống kê
    statsCloseButton.addEventListener('click', closeStatsModal);
    statsTopicFilter.addEventListener('change', populateStatsList); // (MỚI)

    // (MỚI) Modal Xác nhận
    confirmResetCancel.addEventListener('click', closeConfirmResetModal);
    confirmResetConfirm.addEventListener('click', resetAllProgress);
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
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);

    } catch (error) {
        console.error('Lỗi khi gỡ Service Worker, tải lại bình thường:', error);
        window.location.reload();
    }
}


// (CẬP NHẬT) Tải dữ liệu từ Google Sheet
async function loadDataOnline(isManual = false) {
    if (isManual) {
        loadOnlineStatus.style.display = 'block';
        loadOnlineStatus.textContent = "Đang tải từ Sheet...";
        loadOnlineStatus.style.color = "var(--text-color)";
    }

    const oldWordCount = allWords.length;

    try {
        if (!GOOGLE_APPS_SCRIPT_URL || GOOGLE_APPS_SCRIPT_URL.includes('DÁN_URL')) {
             throw new Error('URL Apps Script chưa được cài đặt.');
        }
        
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL);
        if (!response.ok) throw new Error('Không thể tải dữ liệu từ Google Sheet');
        const result = await response.json();
        
        if (!result.success || !result.data) throw new Error(result.error || 'Lỗi cấu trúc dữ liệu trả về');
        
        const newWords = result.data;
        
        // (MỚI) Lưu từ vựng vào cache
        saveAllWordsCache(newWords); 
        allWords = newWords; // Cập nhật biến toàn cục
        
        // (QUAN TRỌNG) Đồng bộ tiến độ (giữ nguyên level cũ)
        syncProgress(allWords);

        // Bật nút (phòng trường hợp cache rỗng lúc đầu)
        modeAudioButton.disabled = false;
        modeTextButton.disabled = false;

        if (isManual) {
            const newWordCount = allWords.length;
            const diff = newWordCount - oldWordCount;
            let diffMessage = `Đã tải xong! Hiện có ${newWordCount} từ.`;
            if (diff > 0) diffMessage += ` (Thêm ${diff} từ mới).`;
            else if (diff < 0) diffMessage += ` (Bớt ${Math.abs(diff)} từ).`;
            
            loadOnlineStatus.textContent = diffMessage;
            loadOnlineStatus.style.color = "var(--correct-color)";
            setTimeout(() => { loadOnlineStatus.style.display = 'none'; }, 4000);
        }

    } catch (error) {
        console.error("Lỗi khi tải online:", error);
        if (isManual) {
            loadOnlineStatus.textContent = `Tải bị lỗi: ${error.message}`;
            loadOnlineStatus.style.color = "var(--incorrect-color)";
        } else if (allWords.length === 0) {
            // Chỉ báo lỗi khi khởi động nếu không có cache
            alert(`Lỗi tải dữ liệu: ${error.message}. Hãy kiểm tra kết nối và thử "Load Data Online" trong Cài đặt.`);
        }
    }
}

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
    topicListContainer.innerHTML = ''; 
    const topics = new Set(allWords.map(word => word.topic || "Khác"));
    
    const allButton = document.createElement('button');
    allButton.className = 'action-button';
    allButton.textContent = 'Tất cả';
    allButton.addEventListener('click', () => selectTopic('Tất cả'));
    topicListContainer.appendChild(allButton);
    
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
    
    // (CẬP NHẬT) Reset điểm khi bắt đầu game mới
    totalScore = 0;
    scoreDisplay.textContent = totalScore;

    startNewRound();
}


// --- Logic SRS (Cốt lõi) ---

// (MỚI) Tải/Lưu từ vựng vào cache
function loadAllWordsCache() {
    const data = localStorage.getItem(ALL_WORDS_CACHE_KEY);
    return data ? JSON.parse(data) : [];
}
function saveAllWordsCache(words) {
    localStorage.setItem(ALL_WORDS_CACHE_KEY, JSON.stringify(words));
}

// Tải/Lưu tiến độ (progress)
function loadProgress() {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

function saveProgress() {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

// (MỚI) Lưu cài đặt Timer
function saveTimerSetting() {
    countdownTime = parseInt(timerSettingInput.value) || 60;
    if (countdownTime < 10) countdownTime = 10; // Tối thiểu 10s
    timerSettingInput.value = countdownTime;
    localStorage.setItem(TIMER_SETTING_KEY, countdownTime);
}

// Đồng bộ từ vựng (Sheet) và tiến độ (cache)
function syncProgress(wordsFromSheet) {
    let updated = false;
    
    for (const word of wordsFromSheet) {
        if (!progress[word.id]) {
            // Nếu từ này MỚI (chưa có trong cache tiến độ)
            // Lấy level/review từ Sheet làm mặc định (nếu là từ mới thì trên Sheet là 0)
            progress[word.id] = {
                level: word.level, 
                nextReview: word.nextReview,
                phonetic: null 
            };
            updated = true;
        } else if (typeof progress[word.id].phonetic === 'undefined') {
            // Đảm bảo các từ cũ có trường phiên âm
            progress[word.id].phonetic = null;
            updated = true;
        }
        // Nếu từ ĐÃ có trong progress, chúng ta KHÔNG làm gì
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
    
    const wordsInTopic = (selectedTopic === "Tất cả")
        ? allWords
        : allWords.filter(word => (word.topic || "Khác") === selectedTopic);

    if (wordsInTopic.length === 0) return []; 

    // Lấy level/nextReview từ 'progress' (localStorage)
    const reviewQueue = wordsInTopic
        .filter(word => progress[word.id] && progress[word.id].nextReview <= today)
        .sort(() => Math.random() - 0.5);

    const newQueue = wordsInTopic
        .filter(word => progress[word.id] && progress[word.id].level === 0 && !reviewQueue.find(w => w.id === word.id))
        .sort(() => Math.random() - 0.5);

    let wordsForRound = [...reviewQueue, ...newQueue];

    if (wordsForRound.length < count) {
        const extraWords = wordsInTopic
            .filter(word => !wordsForRound.find(w => w.id === word.id))
            .sort(() => Math.random() - 0.5);
        wordsForRound = [...wordsForRound, ...extraWords];
    }

    const finalCount = Math.min(count, wordsInTopic.length);
    return wordsForRound.slice(0, finalCount);
}

// Cập nhật tiến độ
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
    
    saveProgress(); // Chỉ lưu 'progress' vào localStorage
}


// --- Logic Game (Đã cập nhật) ---

// (CẬP NHẬT) Bắt đầu màn mới
function startNewRound() {
    showLoader(false);
    gameContainer.style.opacity = 1;
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;

    // 1. Lấy từ
    const words = getWordsToReview();
    if (words.length === 0) {
        if (allWords.length === 0) {
            gameTitle.textContent = "Lỗi tải dữ liệu";
        } else if (selectedTopic !== "Tất cả" && allWords.filter(w => (w.topic || "Khác") === selectedTopic).length === 0) {
             gameTitle.textContent = "Không có từ trong chủ đề này!";
        } else {
             gameTitle.textContent = "Bạn đã học hết từ!";
        }
        nextRoundButton.style.display = 'none'; // Ẩn nút Next nếu không có từ
        timerDisplay.style.display = 'none'; // Ẩn timer
        return;
    }

    // 2. Cập nhật tiêu đề game
    const modeTitle = gameMode === 'audio-only' ? "Nghe và nối" : "Đọc và nối";
    gameTitle.textContent = `${modeTitle} (${selectedTopic})`;
    
    // 3. Tải trước âm thanh (không cần đợi)
    preloadDataForRound(words); 
    
    // 4. (MỚI) Setup màn chơi
    setupRound(words);
}

// (MỚI) Hàm setup màn chơi (dùng cho cả chơi mới và chơi lại)
function setupRound(wordsToPlay) {
    currentWords = wordsToPlay; // Lưu từ của màn này
    
    // Reset giao diện
    gameContainer.style.opacity = 1;
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    isChecking = false;
    
    // Đảm bảo nút Next đúng trạng thái
    nextRoundButton.textContent = "Next";
    nextRoundButton.style.display = 'block';
    nextRoundButton.disabled = true; // (MỚI) Luôn mờ khi bắt đầu
    timerDisplay.style.display = 'block'; // Hiển thị timer

    // Gắn lại listener chuẩn
    nextRoundButton.removeEventListener('click', handleReplayClick);
    nextRoundButton.addEventListener('click', startNewRound);

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

    updateProgress(); // Reset thanh progress bar
    startTimer(); // Bắt đầu đếm ngược
}

function createCard(item, side) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.side = side;
    card.dataset.word = item.word;

    const wordPhonetic = progress[item.id]?.phonetic;

    if (item.type === 'audio-only') {
        card.classList.add('audio-card');
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = '🔊'; 
        cardContent.appendChild(wordEl);
        if (wordPhonetic) {
            const phoneticEl = document.createElement('div');
            phoneticEl.className = 'card-phonetic';
            phoneticEl.textContent = wordPhonetic;
            cardContent.appendChild(phoneticEl);
        }
        card.appendChild(cardContent);
    } else if (item.type === 'phonetic-text' && side === 'left') {
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


// Xử lý nhấn thẻ
function handleCardClick(event) {
    const selectedCard = event.currentTarget;
    
    if (isChecking || selectedCard.classList.contains('disabled') || selectedCard.classList.contains('correct')) return;

    const side = selectedCard.dataset.side;

    if (side === 'left') {
        playAudio(selectedCard.dataset.word);
    }

    // (Bỏ chọn)
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

    // (Chọn)
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

// Kiểm tra
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
        updateWordProgress(wordId, true); 
        updateProgress(); // Cập nhật thanh progress

        if (correctPairs === currentWords.length) {
            // (MỚI) Thắng
            clearInterval(timerInterval); // Dừng timer
            nextRoundButton.disabled = false; // Bật nút "Next"
            gameContainer.style.opacity = 0.5;
        }
        
        selectedLeft = null;
        selectedRight = null;
    } else {
        isChecking = true; 
        
        selectedLeft.classList.add('incorrect');
        selectedRight.classList.add('incorrect');
        totalScore = Math.max(0, totalScore - 5);
        updateWordProgress(wordId, false); 
        updateProgress(); // Cập nhật điểm

        setTimeout(() => {
            selectedLeft.classList.remove('incorrect', 'selected', 'disabled');
            selectedRight.classList.remove('incorrect', 'selected', 'disabled');
            selectedLeft = null;
            selectedRight = null;
            isChecking = false; 
        }, 1000); 
    }
}

// Cập nhật thanh tiến trình
function updateProgress() {
    const progressPercent = (correctPairs / currentWords.length) * 100;
    progressBar.style.width = `${progressPercent}%`;
    scoreDisplay.textContent = totalScore;
}

// --- (MỚI) Logic Timer ---

function startTimer() {
    clearInterval(timerInterval); // Xóa timer cũ
    let timeLeft = countdownTime;
    timerDisplay.classList.remove('warning');
    updateTimerDisplay(timeLeft);

    timerInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay(timeLeft);

        if (timeLeft <= 5 && timeLeft > 0) {
            timerDisplay.classList.add('warning');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
        }
    }, 1000);
}

function updateTimerDisplay(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    timerDisplay.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// (MỚI) Xử lý khi hết giờ
function handleTimeUp() {
    if (correctPairs === currentWords.length) return; // Đã thắng

    isChecking = true; // Khóa bảng
    gameContainer.style.opacity = 0.5;
    // Vô hiệu hóa tất cả thẻ
    document.querySelectorAll('.card').forEach(card => card.classList.add('disabled'));
    
    // Đổi nút "Next" thành "Chơi lại"
    nextRoundButton.textContent = "Chơi lại";
    nextRoundButton.disabled = false; // Bật nút
    
    // Gắn listener cho nút "Chơi lại"
    nextRoundButton.removeEventListener('click', startNewRound);
    nextRoundButton.addEventListener('click', handleReplayClick);
}

// (MỚI) Xử lý khi nhấn "Chơi lại"
function handleReplayClick() {
    // Gắn lại listener chuẩn
    nextRoundButton.removeEventListener('click', handleReplayClick);
    nextRoundButton.addEventListener('click', startNewRound);

    // Trừ điểm
    totalScore = Math.max(0, totalScore - (currentWords.length * 2)); // Trừ 2 điểm mỗi từ
    scoreDisplay.textContent = totalScore;

    // Reset trạng thái màn chơi
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;
    
    // Chơi lại màn (dùng lại currentWords)
    setupRound(currentWords); 
}


// --- Các hàm hỗ trợ ---

// (CẬP NHẬT) Xuất dữ liệu ra Excel
function exportToExcel() {
    showLoader(true, "Đang xuất dữ liệu...");
    try {
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

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "VocabProgress");

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


// Xóa cache âm thanh
async function clearAudioCache() {
    showLoader(true, "Đang xóa cache âm thanh...");
    try {
        await caches.delete(AUDIO_CACHE_NAME);
        await caches.open(AUDIO_CACHE_NAME); 
        
        showLoader(true, "Đã xóa xong!");
        setTimeout(() => { showLoader(false); }, 1500); 
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
        showLoader(true, "Xóa cache thất bại!");
        setTimeout(() => { showLoader(false); }, 2000);
    }
}

// Chuẩn hóa từ
function normalizeWord(word) {
    if (!word) return "";
    return word.trim().toLowerCase();
}

// Tải trước
function preloadDataForRound(words) {
    words.forEach(word => {
        if (!word.english) return;
        fetchAndCacheWordData(word.english, word.id, null, false); 
    });
}

// Phát âm thanh
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

// Lấy ÂM THANH và PHIÊN ÂM
async function fetchAndCacheWordData(word, wordId, audioButtonElement, shouldPlay) {
    let normalizedWord = normalizeWord(word);
    if (!normalizedWord) return;

    if (normalizedWord.includes('-') || normalizedWord.split(' ').length > 2) {
        normalizedWord = normalizedWord.split(/[\s-]+/)[0];
    }

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
            if (!phoneticData) phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "");
            if (!phoneticData && !hasPhonetic) {
                const textOnlyPhonetic = data[0].phonetics.find(p => p.text);
                if(textOnlyPhonetic) phoneticText = textOnlyPhonetic.text;
            }
            if (phoneticData) {
                if (!phoneticText && phoneticData.text) phoneticText = phoneticData.text;
                if(phoneticData.audio) {
                    audioUrl = phoneticData.audio;
                    if (audioUrl.startsWith("//")) audioUrl = "https" + audioUrl;
                }
            }
        }
        
        if (phoneticText && !hasPhonetic) {
            progress[wordId].phonetic = phoneticText;
            saveProgress();
            
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
                        if(audioButtonElement) audioButtonElement.innerHTML = originalHTML;
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


// Phát audio
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

// Hiển thị Loader
function showLoader(show, message = "Đang tải...") {
    if (!loader) return;
    loaderText.textContent = message;
    loader.style.display = show ? 'flex' : 'none';
}

// Xáo trộn mảng
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// --- (MỚI) Các hàm Modal ---

// (MỚI) Học lại từ đầu
function openConfirmResetModal() {
    settingsModal.style.display = 'none';
    confirmResetModal.style.display = 'flex';
}
function closeConfirmResetModal() {
    confirmResetModal.style.display = 'none';
    settingsModal.style.display = 'flex';
}
function resetAllProgress() {
    showLoader(true, "Đang reset tiến độ...");
    const today = getTodayString();
    
    // Lặp qua tất cả tiến độ và set về 0
    Object.keys(progress).forEach(wordId => {
        progress[wordId].level = 0;
        progress[wordId].nextReview = today;
    });

    saveProgress(); // Lưu tiến độ đã reset
    
    setTimeout(() => {
        showLoader(false);
        window.location.reload(); // Tải lại ứng dụng
    }, 1500);
}


// Mở Modal Cài đặt
function openSettingsModal() {
    settingsModal.style.display = 'flex';
}
function closeSettingsModal() {
    settingsModal.style.display = 'none';
}

// (CẬP NHẬT) Mở Modal Thống kê
function openStatsModal() {
    // (MỚI) Tạo danh sách lọc chủ đề
    statsTopicFilter.innerHTML = '';
    const topics = new Set(allWords.map(word => word.topic || "Khác"));
    
    const allOption = document.createElement('option');
    allOption.value = 'Tất cả';
    allOption.textContent = 'Tất cả chủ đề';
    statsTopicFilter.appendChild(allOption);
    
    topics.forEach(topic => {
        const topicOption = document.createElement('option');
        topicOption.value = topic;
        topicOption.textContent = topic;
        statsTopicFilter.appendChild(topicOption);
    });

    populateStatsList(); // Tạo danh sách
    statsModal.style.display = 'flex';
}
function closeStatsModal() {
    statsModal.style.display = 'none';
}

// (CẬP NHẬT) Tạo danh sách Thống kê (lọc theo chủ đề)
function populateStatsList() {
    statsListContainer.innerHTML = ''; // Xóa cũ
    
    // (MỚI) Lấy chủ đề được chọn
    const selectedFilterTopic = statsTopicFilter.value;
    
    // (MỚI) Lọc 'allWords' dựa trên chủ đề
    const wordsToShow = (selectedFilterTopic === 'Tất cả')
        ? allWords
        : allWords.filter(word => (word.topic || "Khác") === selectedFilterTopic);

    // 1. Lấy tất cả từ trong 'wordsToShow' và 'progress'
    const wordsFromProgress = wordsToShow.map(word => {
        const progressData = progress[word.id] || {}; 
        return {
            id: word.id,
            english: word.english || "Không rõ",
            vietnamese: word.vietnamese || "Không rõ",
            level: progressData.level, 
            phonetic: progressData.phonetic || "" 
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
            <span class="stat-level stat-level-${String(word.level)}">Level ${word.level}</span>
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