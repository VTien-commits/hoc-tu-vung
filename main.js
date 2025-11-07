// ***********************************************
// LOGIC SRS (LẶP LẠI NGẮT QUÃNG), PRELOADING VÀ XÓA CACHE
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
let gameMode = 'audio-text'; // 'audio-text' hoặc 'text-text'

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
const clearCacheButton = document.getElementById('clear-cache-button'); // DOM Nút Xóa

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

        // Gán sự kiện cho nút
        nextRoundButton.addEventListener('click', startNewRound);

        // Bắt đầu màn đầu tiên
        startNewRound();
    } catch (error) {
        console.error("Lỗi khi khởi động:", error);
        gameTitle.textContent = "Lỗi tải dữ liệu";
    } finally {
        showLoader(false);
    }
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
                nextReview: today // Học ngay hôm nay
            };
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
    
    // 2. TẢI TRƯỚC ÂM THANH (PRELOAD)
    showLoader(true, "Đang chuẩn bị âm thanh..."); // Hiển thị loader
    await preloadAudioForRound(currentWords);
    showLoader(false); // Ẩn loader khi xong

    // 3. Quyết định chế độ chơi (50/50)
    gameMode = Math.random() < 0.5 ? 'audio-text' : 'text-text';
    
    gameTitle.textContent = gameMode === 'audio-text' ? "Nghe và nối" : "Nối các cặp";

    // 4. Tạo thẻ
    const leftItems = currentWords.map(word => ({
        id: word.id,
        text: gameMode === 'audio-text' ? `🔊` : word.english, // Chế độ nghe hoặc chế độ chữ
        word: word.english, // Dùng để tra cứu audio
        type: gameMode === 'audio-text' ? 'audio' : 'text'
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
    card.textContent = item.text;
    card.dataset.id = item.id;
    card.dataset.side = side;
    
    if (item.type === 'audio') {
        card.classList.add('audio-card');
        card.dataset.word = item.word; // Lưu từ tiếng Anh để phát âm
    }
    
    card.addEventListener('click', handleCardClick);
    return card;
}

// Xử lý khi nhấn vào thẻ
function handleCardClick(event) {
    const selectedCard = event.currentTarget;
    if (selectedCard.classList.contains('disabled') || selectedCard.classList.contains('correct')) return;

    const side = selectedCard.dataset.side;

    // Phát âm thanh nếu là chế độ nghe
    if (gameMode === 'audio-text' && side === 'left') {
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

// Tải trước (preload) âm thanh cho màn chơi
async function preloadAudioForRound(words) {
    console.log(`Đang tải trước âm thanh cho ${words.length} từ...`);
    const preloadPromises = words.map(word => {
        if (!word.english) return Promise.resolve();
        // Gọi hàm fetchAndCacheAudio, nhưng không cần phát (shouldPlay = false)
        return fetchAndCacheAudio(word.english, null, false); 
    });
    
    try {
        await Promise.all(preloadPromises);
        console.log("Tải trước âm thanh hoàn tất.");
    } catch (error) {
        console.warn("Có lỗi xảy ra trong khi tải trước, nhưng vẫn tiếp tục:", error);
    }
}

// Hàm gọi API Âm thanh (ĐÃ CẬP NHẬT)
async function playAudio(word) {
    if (!word) return;
    
    // Tìm nút audio (nếu có)
    const audioButton = document.querySelector(`.card[data-word="${word}"][data-side="left"]`);
    if (audioButton) audioButton.classList.add('selected'); 

    // Gọi hàm fetch (hoặc lấy từ cache) và PHÁT âm thanh (shouldPlay = true)
    fetchAndCacheAudio(word, audioButton, true);
}

// HÀM MỚI: Lấy âm thanh (từ API hoặc Cache) và tùy chọn phát
async function fetchAndCacheAudio(word, audioButtonElement, shouldPlay) {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return;

    try {
        // Gọi API từ điển
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${normalizedWord}`);
        if (!response.ok) throw new Error('Không tìm thấy từ (404)');
        
        const data = await response.json();
        
        // Tìm file âm thanh trong kết quả
        let audioUrl = "";
        if (data[0] && data[0].phonetics) {
            const phoneticWithAudio = data[0].phonetics.find(p => p.audio && p.audio !== "");
            if (phoneticWithAudio) {
                audioUrl = phoneticWithAudio.audio;
                // Đảm bảo URL có https:
                if (audioUrl.startsWith("//")) {
                    audioUrl = "https:" + audioUrl;
                }
            }
        }

        if (audioUrl) {
            const cache = await caches.open(AUDIO_CACHE_NAME);
            let cachedResponse = await cache.match(audioUrl);
            let audioBlob;

            if (cachedResponse) {
                // 1. CÓ CACHE: Lấy từ cache
                console.log(`[Cache] Đã tìm thấy ${normalizedWord}.`);
                audioBlob = await cachedResponse.blob();
            } else {
                // 2. KHÔNG CÓ CACHE: Tải, lưu vào cache
                console.log(`[Network] Đang tải ${normalizedWord}, sẽ lưu vào cache...`);
                const networkResponse = await fetch(audioUrl);
                if (!networkResponse.ok) throw new Error('Không thể tải file MP3');
                await cache.put(audioUrl, networkResponse.clone()); // Lưu bản sao
                audioBlob = await networkResponse.blob(); // Dùng bản gốc
            }

            // 3. Quyết định có phát hay không
            if (shouldPlay) {
                const objectUrl = URL.createObjectURL(audioBlob);
                playAudioFromUrl(objectUrl, audioButtonElement);
            }

        } else {
            console.warn(`Không tìm thấy audio URL cho từ: ${normalizedWord}`);
            if (shouldPlay && audioButtonElement) {
                // Báo lỗi trên nút (ví dụ: đổi text)
                const originalText = audioButtonElement.textContent;
                audioButtonElement.textContent = "Không có audio";
                audioButtonElement.classList.remove('selected');
                setTimeout(() => {
                    audioButtonElement.textContent = originalText;
                }, 1500);
            }
        }

    } catch (error) {
        console.error(`Lỗi khi xử lý âm thanh cho ${word}:`, error);
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