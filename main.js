// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG) VÀ GAME
// PHIÊN BẢN HYBRID (GOOGLE SHEETS + LOCALSTORAGE)
// ***********************************************

// --- Cài đặt Chung ---
// !!! QUAN TRỌNG: Dán URL Ứng dụng web Google Apps Script của bạn vào đây
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/library/d/17RVQueBjd7O61n9sdLCmHiSrmJ-yXITZFeK9lDnLX8VL7SQkHfhKebry/1'; 

const PROGRESS_STORAGE_KEY = 'vocabAppProgress';
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const WORDS_PER_ROUND = 6;

// --- Cài đặt SRS ---
const SRS_LEVELS = {
    0: 0, 1: 1, 2: 3, 3: 7, 4: 14, 5: 30, 6: 60
};
const MAX_LEVEL = 6;

// --- Biến toàn cục ---
let allWords = []; // Kho từ vựng đầy đủ (từ Google Sheet)
let progress = {}; // "Trí nhớ" (luôn đọc từ localStorage)
let currentWords = [];
let selectedLeft = null;
let selectedRight = null;
let correctPairs = 0;
let totalScore = 0;
let gameMode = null;
let selectedTopic = null; // (MỚI)
let isSyncing = false; // (MỚI)

// --- DOM Elements ---
let gameContainer, leftColumn, rightColumn, progressBar, scoreDisplay, nextRoundButton, loader, loaderText, gameTitle;
let modeSelectionOverlay, modeAudioButton, modeTextButton, header, mainContent;
let topicSelectionOverlay, topicList, topicBackButton; // (MỚI)
let settingsModal, settingsButton, settingsCloseButton, homeButton; // (MỚI)
let statsModal, statsButton, statsCloseButton, statsList; // (MỚI)
let clearCacheButton; // (MỚI)


// --- Khởi động ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    
    // 1. Gán giá trị cho DOM Elements
    assignDomElements();

    // 2. Gán tất cả sự kiện
    attachEventListeners();

    // 3. Đăng ký Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('Đã đăng ký Service Worker.');
        } catch (error) {
            console.error('Đăng ký Service Worker thất bại:', error);
        }
    }

    // 4. Lấy dữ liệu
    await loadData();
}

// (MỚI) Gán DOM
function assignDomElements() {
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
    
    // Màn hình 1: Chế độ
    modeSelectionOverlay = document.getElementById('mode-selection-overlay');
    modeAudioButton = document.getElementById('mode-audio-button');
    modeTextButton = document.getElementById('mode-text-button');
    
    // Màn hình 2: Chủ đề
    topicSelectionOverlay = document.getElementById('topic-selection-overlay');
    topicList = document.getElementById('topic-list');
    topicBackButton = document.getElementById('topic-back-button');

    // Cài đặt
    settingsButton = document.getElementById('settings-button');
    settingsModal = document.getElementById('settings-modal');
    settingsCloseButton = document.getElementById('settings-close-button');
    homeButton = document.getElementById('home-button');
    clearCacheButton = document.getElementById('clear-cache-button');

    // Thống kê
    statsButton = document.getElementById('stats-button');
    statsModal = document.getElementById('stats-modal');
    statsCloseButton = document.getElementById('stats-close-button');
    statsList = document.getElementById('stats-list');
}

// (MỚI) Gán Sự kiện
function attachEventListeners() {
    // Màn hình 1: Chế độ
    modeAudioButton.addEventListener('click', () => selectGameMode('audio-only'));
    modeTextButton.addEventListener('click', () => selectGameMode('phonetic-text'));

    // Màn hình 2: Chủ đề
    topicBackButton.addEventListener('click', () => {
        topicSelectionOverlay.style.display = 'none';
        modeSelectionOverlay.style.display = 'flex';
    });

    // Header
    homeButton.addEventListener('click', handleHomeButtonClick);
    settingsButton.addEventListener('click', () => settingsModal.style.display = 'flex');

    // Game
    nextRoundButton.addEventListener('click', startNewRound);

    // Modal Cài đặt
    settingsCloseButton.addEventListener('click', () => settingsModal.style.display = 'none');
    clearCacheButton.addEventListener('click', clearAudioCache);
    statsButton.addEventListener('click', showStatistics);

    // Modal Thống kê
    statsCloseButton.addEventListener('click', () => statsModal.style.display = 'none');
}

// (MỚI) Tải dữ liệu từ Google Sheet và LocalStorage
async function loadData() {
    const loadingStatus = document.getElementById('loading-status');
    
    if (GOOGLE_APPS_SCRIPT_URL === 'DÁN_URL_GOOGLE_APPS_SCRIPT_CỦA_BẠN_VÀO_ĐÂY') {
        loadingStatus.textContent = "Lỗi: URL Apps Script chưa được cài đặt.";
        loadingStatus.style.color = "var(--incorrect-color)";
        console.error("Vui lòng dán URL Google Apps Script vào biến GOOGLE_APPS_SCRIPT_URL trong main.js");
        return;
    }

    try {
        // 1. Tải kho từ vựng (từ Google Sheet)
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        allWords = result.data;
        
        // 2. Tải "trí nhớ" (từ LocalStorage)
        progress = loadProgress();

        // 3. Đồng bộ "trí nhớ"
        // (Kết hợp dữ liệu từ Sheet và LocalStorage)
        syncProgress(allWords);

        // 4. Cập nhật UI khi SẴN SÀNG
        loadingStatus.textContent = "Sẵn sàng! Hãy chọn chế độ.";
        loadingStatus.style.color = "var(--correct-color)";
        modeAudioButton.disabled = false;
        modeTextButton.disabled = false;

    } catch (error) {
        console.error("Lỗi khi khởi động:", error);
        loadingStatus.textContent = "Lỗi tải dữ liệu. Vui lòng tải lại trang.";
        loadingStatus.style.color = "var(--incorrect-color)";
    }
}

// (MỚI) Xử lý nút Home (Đồng bộ và Tải lại)
async function handleHomeButtonClick() {
    if (isSyncing) return; // Ngăn nhấn đúp
    isSyncing = true;
    
    showLoader(true, "Đang đồng bộ tiến độ...");
    
    try {
        await syncProgressToSheet(); // Chờ đồng bộ xong
        showLoader(true, "Đồng bộ thành công!");
    } catch (error) {
        console.error("Đồng bộ thất bại:", error);
        showLoader(true, "Đồng bộ thất bại!");
        // Dù thất bại vẫn tiếp tục
    }
    
    // Chờ 1 giây rồi tải lại trang
    setTimeout(() => {
        location.reload();
    }, 1000);
}

// (MỚI) Đồng bộ LocalStorage lên Google Sheet
async function syncProgressToSheet() {
    console.log("Đang đồng bộ progress lên Google Sheet...");
    
    const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // Cần thiết khi làm việc với GAS ở chế độ "Bất kỳ ai"
        cache: 'no-cache',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(progress) // Gửi toàn bộ "trí nhớ" lên
    });
    
    // Vì dùng 'no-cors', chúng ta không thể đọc response
    // Chúng ta sẽ giả định là thành công nếu không có lỗi mạng
    console.log("Đã gửi yêu cầu đồng bộ.");
}


// --- Logic SRS (Cốt lõi) ---

// Lấy "trí nhớ" từ localStorage
function loadProgress() {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

// Lưu "trí nhớ" vào localStorage (CHỈ LƯU LOCAL)
function saveProgress() {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

// (CẬP NHẬT) Đồng bộ "trí nhớ" khi khởi động
function syncProgress(sheetWords) {
    const today = getTodayString();
    let updated = false;
    
    sheetWords.forEach(word => {
        const localData = progress[word.id];
        
        if (!localData) {
            // 1. Từ chưa có trong localStorage
            // -> Lấy dữ liệu (level, nextReview) từ Sheet
            progress[word.id] = {
                level: word.level || 0,
                nextReview: word.nextReview || today,
                phonetic: null // Phiên âm sẽ được tải sau
            };
            updated = true;
        } else {
            // 2. Từ đã có trong localStorage
            // (localStorage luôn ưu tiên)
            // Đảm bảo trường 'phonetic' tồn tại
            if (typeof localData.phonetic === 'undefined') {
                localData.phonetic = null;
                updated = true;
            }
        }
    });
    
    if (updated) saveProgress();
}

// Lấy ngày hôm nay (dạng YYYY-MM-DD)
function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

// Tính ngày ôn tập tiếp theo
function getNextReviewDate(level) {
    const daysToAdd = SRS_LEVELS[level];
    const date = new Date();
    date.setDate(date.getDate() + daysToAdd);
    return date.toISOString().split('T')[0];
}

// (CẬP NHẬT) Lấy danh sách từ (theo CHỦ ĐỀ)
function getWordsToReview(count = WORDS_PER_ROUND) {
    const today = getTodayString();
    
    // 1. Lọc theo chủ đề đã chọn
    const filteredWords = (selectedTopic && selectedTopic !== 'Tất cả')
        ? allWords.filter(word => word.topic === selectedTopic)
        : allWords;

    // 2. Ưu tiên từ cần ôn tập (đã đến hạn)
    const reviewQueue = filteredWords
        .filter(word => progress[word.id].nextReview <= today)
        .sort(() => Math.random() - 0.5);

    // 3. Nếu không đủ, lấy thêm từ mới (level 0)
    const newQueue = filteredWords
        .filter(word => progress[word.id].level === 0 && !reviewQueue.find(w => w.id === word.id))
        .sort(() => Math.random() - 0.5);

    // 4. Kết hợp lại
    let wordsForRound = [...reviewQueue, ...newQueue];

    // 5. Nếu vẫn không đủ, lấy từ bất kỳ (trong chủ đề đó)
    if (wordsForRound.length < count) {
        const extraWords = filteredWords
            .filter(word => !wordsForRound.find(w => w.id === word.id))
            .sort(() => Math.random() - 0.5);
        wordsForRound = [...wordsForRound, ...extraWords];
    }

    return wordsForRound.slice(0, count);
}

// Cập nhật tiến độ (CHỈ CẬP NHẬT LOCALSTORAGE)
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
    
    saveProgress(); // Chỉ lưu local
}


// --- Logic Game ---

// (CẬP NHẬT) Bước 1: Chọn chế độ
function selectGameMode(mode) {
    gameMode = mode;
    
    // Ẩn màn hình chọn chế độ
    modeSelectionOverlay.style.display = 'none';
    
    // (MỚI) Hiển thị màn hình chọn chủ đề
    showTopicSelection();
}

// (MỚI) Bước 2: Hiển thị chọn chủ đề
function showTopicSelection() {
    // Lấy các chủ đề duy nhất
    const topics = [...new Set(allWords.map(word => word.topic || 'Khác'))];
    topics.sort();
    
    topicList.innerHTML = ''; // Xóa danh sách cũ
    
    // Thêm nút "Tất cả"
    const allButton = document.createElement('button');
    allButton.className = 'action-button';
    allButton.textContent = 'Tất cả chủ đề';
    allButton.addEventListener('click', () => selectTopic('Tất cả'));
    topicList.appendChild(allButton);
    
    // Thêm các nút chủ đề khác
    topics.forEach(topic => {
        const topicButton = document.createElement('button');
        topicButton.className = 'action-button secondary-button';
        topicButton.textContent = topic;
        topicButton.addEventListener('click', () => selectTopic(topic));
        topicList.appendChild(topicButton);
    });
    
    topicSelectionOverlay.style.display = 'flex';
}

// (MỚI) Bước 3: Chọn chủ đề và bắt đầu
function selectTopic(topic) {
    selectedTopic = topic;
    
    // Ẩn màn hình chủ đề
    topicSelectionOverlay.style.display = 'none';

    // Hiển thị giao diện game chính
    header.style.display = 'flex';
    mainContent.style.display = 'block';
    
    // Bắt đầu màn đầu tiên
    startNewRound();
}


// Bắt đầu màn chơi mới
async function startNewRound() {
    showLoader(false);
    nextRoundButton.style.display = 'none';
    gameContainer.style.opacity = 1;
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;

    // 1. Lấy từ (đã lọc theo chủ đề)
    currentWords = getWordsToReview(WORDS_PER_ROUND); 
    
    if (currentWords.length === 0) {
        gameTitle.textContent = "Bạn đã học hết chủ đề này!";
        return;
    }
    
    // 2. TẢI TRƯỚC ÂM THANH VÀ PHIÊN ÂM
    showLoader(true, "Đang chuẩn bị dữ liệu...");
    await preloadDataForRound(currentWords);
    showLoader(false);

    // 3. Cập nhật Tiêu đề
    gameTitle.textContent = `${selectedTopic} (${gameMode === 'audio-only' ? 'Nghe' : 'Đọc'})`;

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

// Tạo một thẻ (card)
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
        // CHẾ ĐỘ TEXT (Bên trái) - Hiển thị Word + Phonetic
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


// Xử lý khi nhấn vào thẻ
function handleCardClick(event) {
    // ... (Giữ nguyên logic) ...
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

// Kiểm tra sự tương ứng
function checkMatch() {
    // ... (Giữ nguyên logic) ...
    const isMatch = selectedLeft.dataset.id === selectedRight.dataset.id;
    const wordId = selectedLeft.dataset.id;
    selectedLeft.classList.add('disabled');
    selectedRight.classList.add('disabled');
    if (isMatch) {
        selectedLeft.classList.add('correct');
        selectedRight.classList.add('correct');
        correctPairs++;
        totalScore += 10;
        updateWordProgress(wordId, true); // Cập nhật local
        if (correctPairs === currentWords.length) {
            gameContainer.style.opacity = 0.5;
            nextRoundButton.style.display = 'block';
        }
    } else {
        selectedLeft.classList.add('incorrect');
        selectedRight.classList.add('incorrect');
        totalScore = Math.max(0, totalScore - 5);
        updateWordProgress(wordId, false); // Cập nhật local
        setTimeout(() => {
            selectedLeft.classList.remove('incorrect', 'selected', 'disabled');
            selectedRight.classList.remove('incorrect', 'selected', 'disabled');
            selectedLeft = null;
            selectedRight = null;
        }, 1000);
    }
    if (isMatch) {
        selectedLeft = null;
        selectedRight = null;
    }
    updateProgress();
}

// Cập nhật thanh tiến trình và điểm
function updateProgress() {
    const progressPercent = (correctPairs / currentWords.length) * 100;
    progressBar.style.width = `${progressPercent}%`;
    scoreDisplay.textContent = totalScore;
}

// --- (MỚI) Logic Cài đặt & Thống kê ---

// Hiển thị Thống kê
function showStatistics() {
    statsList.innerHTML = ''; // Xóa cũ
    
    // 1. Lấy dữ liệu từ allWords và progress (localStorage)
    const statsData = allWords.map(word => {
        const wordProgress = progress[word.id] || { level: 0 };
        return {
            english: word.english,
            level: wordProgress.level
        };
    });
    
    // 2. Sắp xếp (Level cao nhất -> thấp nhất)
    statsData.sort((a, b) => b.level - a.level);
    
    // 3. Hiển thị
    statsData.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'stat-item';
        
        const wordEl = document.createElement('span');
        wordEl.className = 'stat-word';
        wordEl.textContent = item.english;
        
        const levelEl = document.createElement('span');
        levelEl.className = `stat-level stat-level-${item.level}`;
        levelEl.textContent = `Level ${item.level}`;
        
        itemEl.appendChild(wordEl);
        itemEl.appendChild(levelEl);
        statsList.appendChild(itemEl);
    });
    
    statsModal.style.display = 'flex';
}

// Xóa cache âm thanh theo yêu cầu
async function clearAudioCache() {
    console.log('Đang xóa cache âm thanh...');
    showLoader(true, "Đang xóa cache âm thanh...");
    try {
        await caches.delete(AUDIO_CACHE_NAME);
        await caches.open(AUDIO_CACHE_NAME); // Mở lại cache rỗng
        showLoader(true, "Đã xóa xong!");
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
        showLoader(true, "Xóa cache thất bại!");
    }
    setTimeout(() => showLoader(false), 1500);
}


// --- Các hàm hỗ trợ (Audio & API) ---

// Chuẩn hóa từ
function normalizeWord(word) {
    if (!word) return "";
    return word.trim().toLowerCase();
}

// Tải trước (preload) dữ liệu
async function preloadDataForRound(words) {
    const preloadPromises = words.map(word => {
        if (!word.english) return Promise.resolve();
        return fetchAndCacheWordData(word.english, word.id, null, false); 
    });
    try {
        await Promise.allSettled(preloadPromises);
    } catch (error) {
        console.warn("Lỗi khi tải trước, nhưng vẫn tiếp tục:", error);
    }
}

// Hàm gọi API Âm thanh
async function playAudio(word) {
    if (!word) return;
    const audioButton = document.querySelector(`.card[data-word="${word}"][data-side="left"]`);
    if (audioButton) audioButton.classList.add('selected'); 

    const wordData = allWords.find(w => w.english === word);
    if (!wordData) return;

    fetchAndCacheWordData(word, wordData.id, audioButton, true);
}

// Lấy ÂM THANH và PHIÊN ÂM
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
            let phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "" && p.text) ||
                               data[0].phonetics.find(p => p.audio && p.audio !== "");
            
            if (!phoneticData && !hasPhonetic) {
                const textOnlyPhonetic = data[0].phonetics.find(p => p.text);
                if(textOnlyPhonetic) phoneticText = textOnlyPhonetic.text;
            }

            if (phoneticData) {
                if (!phoneticText && phoneticData.text) phoneticText = phoneticData.text;
                if(phoneticData.audio) audioUrl = phoneticData.audio.startsWith("//") ? "https:" + phoneticData.audio : phoneticData.audio;
            }
        }
        
        if (phoneticText && !hasPhonetic) {
            progress[wordId].phonetic = phoneticText;
            saveProgress(); // Lưu phonetic vào local
        }

        if (audioUrl) {
            let cachedResponse = await cache.match(audioUrl);
            let audioBlob;
            if (cachedResponse) {
                if (shouldPlay) console.log(`[Cache] Đã tìm thấy ${normalizedWord}.`);
                audioBlob = await cachedResponse.blob();
            } else {
                console.log(`[Network] Đang tải ${normalizedWord}...`);
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
                console.warn(`Không tìm thấy audio URL cho: ${normalizedWord}`);
                if (audioButtonElement) {
                    const originalHTML = audioButtonElement.innerHTML;
                    audioButtonElement.innerHTML = "Không có audio";
                    audioButtonElement.classList.remove('selected');
                    setTimeout(() => { audioButtonElement.innerHTML = originalHTML; }, 1500);
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


// Hàm helper phát audio
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

// Hàm hiển thị/ẩn loader
function showLoader(show, message = "Đang tải...") {
    if (!loader) return;
    loaderText.textContent = message;
    loader.style.display = show ? 'flex' : 'none';
}

// Hàm xáo trộn mảng
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}