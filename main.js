// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG), PRELOADING VÀ XÓA CACHE
// PHIÊN BẢN CÓ 2 CHẾ ĐỘ (NGHE / ĐỌC)
// ***********************************************

// --- Cài đặt SRS ---
const PROGRESS_STORAGE_KEY = 'vocabAppProgress'; // Khóa lưu "trí nhớ"
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
let allWords = []; // Kho từ vựng đầy đủ
let progress = {}; // "Trí nhớ" về tiến độ học
let currentWords = []; // 6 từ trong màn hiện tại
let selectedLeft = null;
let selectedRight = null;
let correctPairs = 0;
let totalScore = 0;
let gameMode = null; // (CẬP NHẬT) Sẽ được đặt khi người dùng chọn

// --- DOM Elements ---
const gameContainer = document.getElementById('game-container');
const leftColumn = document.getElementById('left-column');
const rightColumn = document.getElementById('right-column');
const progressBar = document.getElementById('progress-bar');
const scoreDisplay = document.getElementById('score');
const nextRoundButton = document.getElementById('next-round-button');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const gameTitle = document.getElementById('game-title');
const clearCacheButton = document.getElementById('clear-cache-button');

// (MỚI) DOM Elements cho chọn chế độ
const modeSelectionOverlay = document.getElementById('mode-selection-overlay');
const modeAudioButton = document.getElementById('mode-audio-button');
const modeTextButton = document.getElementById('mode-text-button');
const header = document.querySelector('header');
const mainContent = document.querySelector('.main-container');


// --- Khởi động ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    // 1. Đăng ký Service Worker
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('Đã đăng ký Service Worker.');
        } catch (error) {
            console.error('Đăng ký Service Worker thất bại:', error);
        }
    }

    // 2. Gán sự kiện cho nút "Xóa Cache"
    if (clearCacheButton) {
        clearCacheButton.addEventListener('click', clearAudioCache);
    }

    // 3. Lấy dữ liệu từ vựng và "trí nhớ"
    showLoader(true, "Đang tải dữ liệu...");
    try {
        // Tải kho từ vựng
        const response = await fetch('words.json');
        if (!response.ok) throw new Error('Không thể tải file words.json');
        allWords = await response.json();
        
        // Tải "trí nhớ"
        progress = loadProgress();

        // Đồng bộ "trí nhớ" với kho từ vựng (cho trường hợp thêm từ mới)
        syncProgress();

        // Gán sự kiện cho nút (Màn tiếp theo)
        nextRoundButton.addEventListener('click', startNewRound);

        // (MỚI) Gán sự kiện cho nút chọn chế độ
        modeAudioButton.addEventListener('click', () => selectGameMode('audio-only'));
        modeTextButton.addEventListener('click', () => selectGameMode('phonetic-text'));

        // (CẬP NHẬT) Không bắt đầu game ngay, chỉ ẩn loader
        // Màn hình chọn chế độ đã hiển thị mặc định
        showLoader(false);

    } catch (error) {
        console.error("Lỗi khi khởi động:", error);
        // Hiển thị lỗi trên màn hình chọn chế độ nếu có thể
        if(modeSelectionOverlay) {
            modeSelectionOverlay.innerHTML = `<h2>Lỗi tải dữ liệu</h2><p>${error.message}</p><p>Vui lòng tải lại trang.</p>`;
        } else {
            gameTitle.textContent = "Lỗi tải dữ liệu";
        }
        showLoader(false); // Ẩn loader nếu có lỗi
    }
}

// (MỚI) Hàm chọn chế độ chơi và bắt đầu game
function selectGameMode(mode) {
    gameMode = mode;
    
    // Ẩn màn hình chọn chế độ
    modeSelectionOverlay.style.display = 'none';
    
    // Hiển thị giao diện game chính
    header.style.display = 'flex';
    mainContent.style.display = 'block';
    
    // Bắt đầu màn đầu tiên
    startNewRound();
}


// --- Logic SRS (Cốt lõi) ---

// Lấy "trí nhớ" từ localStorage
function loadProgress() {
    const data = localStorage.getItem(PROGRESS_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
}

// Lưu "trí nhớ" vào localStorage
function saveProgress() {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

// Đồng bộ "trí nhớ" (đảm bảo mọi từ trong words.json đều có trong "trí nhớ")
function syncProgress() {
    const today = getTodayString();
    let updated = false;
    for (const word of allWords) {
        if (!progress[word.id]) {
            progress[word.id] = {
                level: 0, // Mới
                nextReview: today, // Học ngay hôm nay
                phonetic: null // (CẬP NHẬT) Thêm trường phonetic
            };
            updated = true;
        } else if (typeof progress[word.id].phonetic === 'undefined') {
            // Cập nhật cho người dùng cũ (nếu có)
            progress[word.id].phonetic = null;
            updated = true;
        }
    }
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

// Lấy danh sách từ cho màn mới (LOGIC MỚI)
function getWordsToReview(count = WORDS_PER_ROUND) {
    const today = getTodayString();
    
    // 1. Ưu tiên từ cần ôn tập (đã đến hạn)
    const reviewQueue = allWords
        .filter(word => progress[word.id].nextReview <= today)
        .sort(() => Math.random() - 0.5); // Xáo trộn hàng chờ ôn tập

    // 2. Nếu không đủ, lấy thêm từ mới (level 0)
    const newQueue = allWords
        .filter(word => progress[word.id].level === 0 && !reviewQueue.find(w => w.id === word.id))
        .sort(() => Math.random() - 0.5);

    // 3. Kết hợp lại
    let wordsForRound = [...reviewQueue, ...newQueue];

    // 4. Nếu vẫn không đủ (ví dụ đã học hết), lấy từ bất kỳ (trừ từ vừa học)
    if (wordsForRound.length < count) {
        const extraWords = allWords
            .filter(word => !wordsForRound.find(w => w.id === word.id))
            .sort(() => Math.random() - 0.5);
        wordsForRound = [...wordsForRound, ...extraWords];
    }

    return wordsForRound.slice(0, count); // Đảm bảo luôn trả về đúng số lượng
}

// Cập nhật tiến độ của một từ (LOGIC MỚI)
function updateWordProgress(wordId, isCorrect) {
    if (!progress[wordId]) return; // Từ không tồn tại

    let currentLevel = progress[wordId].level;

    if (isCorrect) {
        // Trả lời đúng
        currentLevel = Math.min(currentLevel + 1, MAX_LEVEL);
    } else {
        // Trả lời sai
        currentLevel = Math.max(currentLevel - 1, 0); // Giảm level, nhưng không xuống dưới 0
    }

    progress[wordId].level = currentLevel;
    progress[wordId].nextReview = getNextReviewDate(currentLevel);
    
    saveProgress();
}


// --- Logic Game (Đã cập nhật) ---

// Bắt đầu màn chơi mới (ĐÃ CẬP NHẬT)
async function startNewRound() {
    // (MỚI) Kiểm tra nếu chưa chọn chế độ thì không làm gì cả
    if (!gameMode) {
        console.error("Lỗi: startNewRound() được gọi khi chưa chọn gameMode.");
        // Hiển thị lại màn hình chọn
        modeSelectionOverlay.style.display = 'flex';
        header.style.display = 'none';
        mainContent.style.display = 'none';
        return;
    }

    showLoader(false);
    nextRoundButton.style.display = 'none';
    gameContainer.style.opacity = 1;
    leftColumn.innerHTML = '';
    rightColumn.innerHTML = '';
    selectedLeft = null;
    selectedRight = null;
    correctPairs = 0;

    // 1. Lấy từ theo logic SRS
    currentWords = getWordsToReview(WORDS_PER_ROUND); 
    
    if (currentWords.length === 0) {
        gameTitle.textContent = "Bạn đã học hết từ!";
        return;
    }
    
    // 2. TẢI TRƯỚC ÂM THANH VÀ PHIÊN ÂM (PRELOAD)
    showLoader(true, "Đang chuẩn bị dữ liệu..."); // Cập nhật text
    await preloadDataForRound(currentWords); // Đổi tên hàm
    showLoader(false); // Ẩn loader khi xong

    // 3. (CẬP NHẬT) Quyết định chế độ chơi
    // Đã xóa dòng: gameMode = Math.random() < 0.5 ? 'audio-only' : 'phonetic-text';
    
    gameTitle.textContent = gameMode === 'audio-only' ? "Nghe và nối" : "Đọc và nối"; // Cập nhật tiêu đề

    // 4. Tạo thẻ (Logic này giữ nguyên, đã dựa vào gameMode)
    const leftItems = currentWords.map(word => ({
        id: word.id,
        text: gameMode === 'audio-only' ? `🔊` : word.english, // Kiểu 1: Icon, Kiểu 2: Chữ
        word: word.english, // Dùng để tra cứu audio
        type: gameMode // 'audio-only' hoặc 'phonetic-text'
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

// Tạo một thẻ (card) (ĐÃ CẬP NHẬT)
function createCard(item, side) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.dataset.side = side;
    card.dataset.word = item.word; // Luôn gán word để phát âm

    if (item.type === 'audio-only') {
        // (CẬP NHẬT) CHẾ ĐỘ AUDIO (Bên trái)
        card.classList.add('audio-card');
        card.textContent = '🔊';
    } else if (item.type === 'phonetic-text' && side === 'left') {
        // (CẬP NHẬT) CHẾ ĐỘ TEXT (Bên trái) - Hiển thị Word + Phonetic
        card.classList.add('text-audio-card'); // Class để nhận diện
        
        const wordPhonetic = progress[item.id]?.phonetic; // Lấy phiên âm đã lưu
        
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        
        const wordEl = document.createElement('div');
        wordEl.className = 'card-word';
        wordEl.textContent = item.text; // item.text là word.english
        cardContent.appendChild(wordEl);

        // Chỉ hiển thị phiên âm nếu đã tải được
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


// Xử lý khi nhấn vào thẻ (ĐÃ CẬP NHẬT)
function handleCardClick(event) {
    const selectedCard = event.currentTarget;
    if (selectedCard.classList.contains('disabled') || selectedCard.classList.contains('correct')) return;

    const side = selectedCard.dataset.side;

    // (CẬP NHẬT) Phát âm thanh khi nhấn BẤT KỲ thẻ nào bên trái
    if (side === 'left') {
        playAudio(selectedCard.dataset.word);
    }

    // Hủy chọn nếu nhấn lại
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

    // Chọn thẻ
    selectedCard.classList.add('selected');
    if (side === 'left') {
        if (selectedLeft) selectedLeft.classList.remove('selected');
        selectedLeft = selectedCard;
    } else {
        if (selectedRight) selectedRight.classList.remove('selected');
        selectedRight = selectedCard;
    }

    // Kiểm tra nếu đã chọn đủ 2 thẻ
    if (selectedLeft && selectedRight) {
        checkMatch();
    }
}

// Kiểm tra sự tương ứng (ĐÃ CẬP NHẬT)
function checkMatch() {
    const isMatch = selectedLeft.dataset.id === selectedRight.dataset.id;
    const wordId = selectedLeft.dataset.id; // Lấy ID của từ

    // Vô hiệu hóa 2 thẻ
    selectedLeft.classList.add('disabled');
    selectedRight.classList.add('disabled');

    if (isMatch) {
        // ĐÚNG
        selectedLeft.classList.add('correct');
        selectedRight.classList.add('correct');
        correctPairs++;
        totalScore += 10;
        
        // Cập nhật tiến độ SRS (Đúng)
        updateWordProgress(wordId, true);

        // Hoàn thành màn
        if (correctPairs === currentWords.length) {
            gameContainer.style.opacity = 0.5;
            nextRoundButton.style.display = 'block';
        }
    } else {
        // SAI
        selectedLeft.classList.add('incorrect');
        selectedRight.classList.add('incorrect');
        totalScore = Math.max(0, totalScore - 5); // Trừ điểm

        // Cập nhật tiến độ SRS (Sai)
        updateWordProgress(wordId, false);

        // Xóa trạng thái sau 1 giây
        setTimeout(() => {
            selectedLeft.classList.remove('incorrect', 'selected', 'disabled');
            selectedRight.classList.remove('incorrect', 'selected', 'disabled');
            selectedLeft = null;
            selectedRight = null;
        }, 1000);
    }

    // Reset nếu ĐÚNG
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

// --- Các hàm hỗ trợ (Đã cập nhật) ---

// HÀM MỚI: Xóa cache âm thanh theo yêu cầu
async function clearAudioCache() {
    console.log('Đang xóa cache âm thanh theo yêu cầu...');
    showLoader(true, "Đang xóa cache âm thanh..."); // Hiển thị thông báo
    try {
        await caches.delete(AUDIO_CACHE_NAME); // Xóa cache
        console.log('Đã xóa cache âm thanh thành công.');
        
        // Mở lại cache (rỗng) để sẵn sàng cho lần tải tiếp theo
        await caches.open(AUDIO_CACHE_NAME); 
        
        showLoader(true, "Đã xóa xong!"); // Thông báo thành công

        // Ẩn loader sau 1.5 giây
        setTimeout(() => {
            showLoader(false);
        }, 1500); 
    } catch (err) {
        console.error('Lỗi khi xóa cache âm thanh:', err);
        showLoader(true, "Xóa cache thất bại!");
        setTimeout(() => {
            showLoader(false);
        }, 2000);
    }
}

// Chuẩn hóa từ (để tra cứu API)
function normalizeWord(word) {
    if (!word) return "";
    return word.trim().toLowerCase();
}

// (CẬP NHẬT) Tải trước (preload) dữ liệu (âm thanh VÀ phiên âm)
async function preloadDataForRound(words) {
    console.log(`Đang tải trước dữ liệu cho ${words.length} từ...`);
    const preloadPromises = words.map(word => {
        if (!word.english) return Promise.resolve();
        // Gọi hàm fetch, không phát (shouldPlay = false)
        return fetchAndCacheWordData(word.english, word.id, null, false); 
    });
    
    try {
        await Promise.all(preloadPromises);
        console.log("Tải trước dữ liệu hoàn tất.");
    } catch (error) {
        console.warn("Có lỗi xảy ra trong khi tải trước, nhưng vẫn tiếp tục:", error);
    }
}

// Hàm gọi API Âm thanh (ĐÃ CẬP NHẬT)
async function playAudio(word) {
    if (!word) return;
    
    // Tìm nút (audio hoặc text-audio)
    const audioButton = document.querySelector(`.card[data-word="${word}"][data-side="left"]`);
    if (audioButton) audioButton.classList.add('selected'); 

    // Lấy ID từ `allWords` để tra cứu progress
    const wordData = allWords.find(w => w.english === word);
    if (!wordData) {
        console.error(`Không tìm thấy wordData cho: ${word}`);
        return;
    }

    // Gọi hàm fetch (hoặc lấy từ cache) và PHÁT âm thanh (shouldPlay = true)
    fetchAndCacheWordData(word, wordData.id, audioButton, true);
}

// (CẬP NHẬT) Lấy ÂM THANH và PHIÊN ÂM (từ API hoặc Cache)
async function fetchAndCacheWordData(word, wordId, audioButtonElement, shouldPlay) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return;

    // 1. Kiểm tra xem đã có đủ dữ liệu chưa
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const hasPhonetic = progress[wordId]?.phonetic; // Đã có phiên âm chưa?
    
    try {
        // Gọi API từ điển
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${normalizedWord}`);
        if (!response.ok) throw new Error('Không tìm thấy từ (404)');
        
        const data = await response.json();
        
        let audioUrl = "";
        let phoneticText = hasPhonetic ? progress[wordId].phonetic : null; // Giữ lại nếu đã có

        if (data[0] && data[0].phonetics) {
            // Ưu tiên tìm entry có cả audio và text
            let phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "" && p.text);
            
            // Nếu không có, tìm entry chỉ có audio
            if (!phoneticData) {
                phoneticData = data[0].phonetics.find(p => p.audio && p.audio !== "");
            }

            // Nếu vẫn không có, tìm entry chỉ có text
            if (!phoneticData && !hasPhonetic) {
                const textOnlyPhonetic = data[0].phonetics.find(p => p.text);
                if(textOnlyPhonetic) phoneticText = textOnlyPhonetic.text;
            }

            if (phoneticData) {
                // TÌM PHIÊN ÂM (nếu chưa có)
                if (!phoneticText && phoneticData.text) {
                    phoneticText = phoneticData.text;
                }
                
                // TÌM AUDIO URL
                if(phoneticData.audio) {
                    audioUrl = phoneticData.audio;
                    if (audioUrl.startsWith("//")) {
                        audioUrl = "https:" + audioUrl;
                    }
                }
            }
        }
        
        // Lưu phiên âm (nếu tìm thấy và chưa có)
        if (phoneticText && !hasPhonetic) {
            progress[wordId].phonetic = phoneticText;
            saveProgress();
            
            // CẬP NHẬT GIAO DIỆN NGAY: Nếu thẻ đang hiển thị, cập nhật phiên âm
            // (CẬP NHẬT) Chỉ cập nhật nếu đang ở chế độ 'phonetic-text'
            if (gameMode === 'phonetic-text') {
                const card = document.querySelector(`.card[data-id="${wordId}"][data-side="left"]`);
                // Thêm kiểm tra card.querySelector('.card-content')
                if (card && card.querySelector('.card-content') && !card.querySelector('.card-phonetic')) {
                    const phoneticEl = document.createElement('div');
                    phoneticEl.className = 'card-phonetic';
                    phoneticEl.textContent = phoneticText;
                    card.querySelector('.card-content').appendChild(phoneticEl);
                }
            }
        }


        if (audioUrl) {
            // Xử lý cache và phát âm thanh (như cũ)
            let cachedResponse = await cache.match(audioUrl);
            let audioBlob;

            if (cachedResponse) {
                if (shouldPlay) console.log(`[Cache] Đã tìm thấy ${normalizedWord}.`);
                audioBlob = await cachedResponse.blob();
            } else {
                console.log(`[Network] Đang tải ${normalizedWord}, sẽ lưu vào cache...`);
                const networkResponse = await fetch(audioUrl);
                if (!networkResponse.ok) throw new Error('Không thể tải file MP3');
                await cache.put(audioUrl, networkResponse.clone()); // Lưu bản sao
                audioBlob = await networkResponse.blob(); // Dùng bản gốc
            }

            if (shouldPlay) {
                const objectUrl = URL.createObjectURL(audioBlob);
                playAudioFromUrl(objectUrl, audioButtonElement);
            }

        } else {
            // Không tìm thấy Audio URL
            if (shouldPlay) { // Chỉ báo lỗi nếu người dùng nhấn nút
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


// Hàm helper phát audio (có callback khi hết)
function playAudioFromUrl(url, audioButton) {
    const audio = new Audio(url);
    
    // Khi phát xong, bỏ chọn nút
    audio.onended = () => {
        if (audioButton && audioButton !== selectedLeft) {
            audioButton.classList.remove('selected');
        }
        URL.revokeObjectURL(url); // Giải phóng bộ nhớ
    };
    
    // Xử lý lỗi
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