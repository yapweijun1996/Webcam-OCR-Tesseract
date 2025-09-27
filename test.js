// Image OCR Test Application using Tesseract.js
class ImageOCRTest {
    constructor() {
        this.imageInput = document.getElementById('imageInput');
        this.selectImageBtn = document.getElementById('selectImageBtn');
        this.removeImageBtn = document.getElementById('removeImageBtn');
        this.uploadArea = document.getElementById('uploadArea');
        this.imagePreview = document.getElementById('imagePreview');
        this.previewImage = document.getElementById('previewImage');
        this.ocrBtn = document.getElementById('ocrBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.querySelector('.status-text');
        this.statusDot = document.querySelector('.status-dot');
        this.resultsList = document.getElementById('resultsList');
        this.topLoader = document.getElementById('topLoader');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.querySelector('.error-text');
        this.languageSelect = document.getElementById('languageSelect');

        this.selectedLanguage = 'eng';
        this.selectedImageFile = null;
        this.isProcessing = false;
        this.recognitionHistory = [];

        this.initializeEventListeners();
        this.setupDragAndDrop();
    }

    initializeEventListeners() {
        // File input change
        this.imageInput.addEventListener('change', (e) => this.handleImageSelection(e));

        // Select image button
        this.selectImageBtn.addEventListener('click', () => this.imageInput.click());

        // Remove image button
        if (this.removeImageBtn) {
            this.removeImageBtn.addEventListener('click', () => this.removeImage());
        }

        // OCR button
        this.ocrBtn.addEventListener('click', () => this.processImageOCR());

        // Clear button
        this.clearBtn.addEventListener('click', () => this.clearResults());

        // Language selection
        if (this.languageSelect) {
            this.languageSelect.addEventListener('change', (e) => {
                this.selectedLanguage = e.target.value;
            });
        }
    }

    setupDragAndDrop() {
        // Drag and drop functionality
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.remove('drag-over');
            });
        });

        this.uploadArea.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileDrop(files[0]);
            }
        });
    }

    handleImageSelection(e) {
        const file = e.target.files[0];
        if (file) {
            this.processSelectedFile(file);
        }
    }

    handleFileDrop(file) {
        if (file && file.type.startsWith('image/')) {
            this.processSelectedFile(file);
        } else {
            this.showError('Please select a valid image file');
        }
    }

    processSelectedFile(file) {
        this.selectedImageFile = file;

        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.previewImage.src = e.target.result;
            this.imagePreview.style.display = 'flex';
            this.uploadArea.style.display = 'none';
            this.ocrBtn.disabled = false;
            this.setStatus('Image loaded', 'success');
        };
        reader.readAsDataURL(file);
    }

    removeImage() {
        this.selectedImageFile = null;
        this.imagePreview.style.display = 'none';
        this.uploadArea.style.display = 'block';
        this.ocrBtn.disabled = true;
        this.imageInput.value = '';
        this.setStatus('Ready', 'warning');
    }

    async processImageOCR() {
        if (this.isProcessing || !this.selectedImageFile) {
            return;
        }

        try {
            this.isProcessing = true;
            this.showProcessing(true);
            this.setStatus('Processing...', 'warning');

            // Convert image file to data URL for Tesseract
            const imageDataUrl = await this.fileToDataURL(this.selectedImageFile);

            this.setStatus('Recognizing text...', 'warning');
            console.log('OCR Language:', this.selectedLanguage); // Debug log
            console.log('Image size:', this.previewImage.naturalWidth + 'x' + this.previewImage.naturalHeight); // Debug image size

            // Perform OCR using Tesseract.js with optimized settings
            const { data: { text, confidence } } = await Tesseract.recognize(
                imageDataUrl,
                this.selectedLanguage,
                {
                    logger: m => {
                        console.log('Tesseract progress:', m);
                        if (m.status === 'recognizing text') {
                            this.setStatus(`Recognizing... ${Math.round(m.progress * 100)}%`, 'warning');
                        }
                    },
                    // Enhanced Tesseract configuration for business cards
                    tessedit_pageseg_mode: '6', // Uniform block of text
                    tessedit_ocr_engine_mode: '2', // Use LSTM OCR engine
                    preserve_interword_spaces: '1',
                    tessedit_char_whitelist: this.getCharacterWhitelist(),
                    // Additional accuracy improvements
                    tessedit_enable_doc_dict: '1',
                    language_model_penalty_non_freq_dict_word: '0.15',
                    language_model_penalty_non_dict_word: '0.15',
                    // Try different PSM modes if initial fails
                    tessedit_pageseg_mode: '3' // Fully automatic
                }
            );

            console.log('Raw OCR Result:', { text, confidence }); // Debug raw result

            // Clean up the text result
            const cleanedText = this.cleanOCRText(text);

            // Add result to history
            const result = {
                text: cleanedText,
                confidence: Math.round(confidence),
                timestamp: new Date().toLocaleTimeString(),
                imageData: imageDataUrl,
                filename: this.selectedImageFile.name
            };

            this.addResultToList(result);
            this.setStatus('Recognition complete', 'success');

        } catch (error) {
            console.error('OCR Error:', error);
            this.showError('Text recognition failed. Please try again.');
            this.setStatus('Recognition failed', 'error');
        } finally {
            this.isProcessing = false;
            this.showProcessing(false);
        }
    }

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });
    }

    addResultToList(result) {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        const filename = document.createElement('div');
        filename.className = 'result-filename';
        filename.textContent = `File: ${result.filename}`;

        const timestamp = document.createElement('div');
        timestamp.className = `result-timestamp ${this.getConfidenceClass(result.confidence)}`;
        timestamp.textContent = `${result.timestamp} - Confidence: ${result.confidence}%`;

        const resultText = document.createElement('div');
        resultText.className = 'result-text';
        resultText.textContent = result.text || 'No text detected';

        resultItem.appendChild(filename);
        resultItem.appendChild(timestamp);
        resultItem.appendChild(resultText);

        // Add click handler to show image
        resultItem.addEventListener('click', () => {
            this.showResultImage(result.imageData);
        });

        this.resultsList.insertBefore(resultItem, this.resultsList.firstChild);

        // Keep only last 10 results
        while (this.resultsList.children.length > 10) {
            this.resultsList.removeChild(this.resultsList.lastChild);
        }

        this.recognitionHistory.unshift(result);
    }

    showResultImage(imageData) {
        // Create modal or overlay to show captured image
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            cursor: pointer;
        `;

        const img = document.createElement('img');
        img.src = imageData;
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        `;

        modal.appendChild(img);
        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        document.body.appendChild(modal);
    }

    clearResults() {
        this.resultsList.innerHTML = '';
        this.recognitionHistory = [];
    }

    setStatus(text, type) {
        this.statusText.textContent = text;

        // Remove previous status classes
        this.statusDot.className = 'status-dot';

        // Add new status class
        switch (type) {
            case 'success':
                this.statusDot.classList.add('success');
                this.statusDot.style.backgroundColor = 'var(--success)';
                break;
            case 'error':
                this.statusDot.classList.add('error');
                this.statusDot.style.backgroundColor = 'var(--error)';
                break;
            case 'warning':
            default:
                this.statusDot.classList.add('warning');
                this.statusDot.style.backgroundColor = 'var(--warning)';
                break;
        }
    }

    getConfidenceClass(confidence) {
        if (confidence >= 80) return 'high-confidence';
        if (confidence >= 60) return 'medium-confidence';
        return 'low-confidence';
    }

    showProcessing(show) {
        if (this.topLoader) {
            this.topLoader.style.display = show ? 'block' : 'none';
        }
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.errorMessage.style.display = 'none';
        }, 5000);
    }

    getCharacterWhitelist() {
        // Return character whitelist based on selected language for better accuracy
        switch (this.selectedLanguage) {
            case 'eng':
                return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-()@';
            case 'chi_sim':
                return '的一是在不了有和人了这上着个地到大里说去子得也起时来二点是两为道做种开见面天后前头同经发成向而多全三小口女白子四五目耳手文其业本民力此处求金长得色只关信间三小口女白子四五目耳手文其业本民力此处求金长得色只关信间';
            case 'jpn':
                return 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789 .,!?-()';
            case 'kor':
                return 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣabcdefghijklnmopqrstuvwxyzABCDEFGHIJKLNMOPQRSTUVWXYZ0123456789 .,!?-()';
            default:
                return ''; // No whitelist for mixed languages
        }
    }

    cleanOCRText(text) {
        if (!text) return '';

        // Remove excessive special characters and symbols
        let cleaned = text.replace(/[=(){}[\]"']/g, '');

        // Fix common OCR mistakes
        cleaned = cleaned.replace(/\|/g, 'I');
        cleaned = cleaned.replace(/\*/g, '');
        cleaned = cleaned.replace(/\+/g, '');
        cleaned = cleaned.replace(/½/g, '');
        cleaned = cleaned.replace(/¼/g, '');

        // Fix email patterns
        cleaned = cleaned.replace(/([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/g, '$1@$2');

        // Fix phone number patterns
        cleaned = cleaned.replace(/\(?(\d{3})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})/g, '($1) $2-$3');

        // Remove standalone symbols but keep meaningful ones
        cleaned = cleaned.replace(/\b[=:]+\b/g, '');

        // Clean up extra whitespace
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = cleaned.replace(/\n+/g, '\n');

        // Remove lines that are mostly symbols
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter(line => {
            const symbolCount = (line.match(/[^a-zA-Z0-9\s@.-]/g) || []).length;
            const alphaNumCount = (line.match(/[a-zA-Z0-9]/g) || []).length;
            return alphaNumCount > symbolCount || alphaNumCount > 2;
        });

        return filteredLines.join('\n').trim();
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.imageOCRTest = new ImageOCRTest();
});

// Add Tesseract.js CDN script if not already present
if (!document.querySelector('script[src*="tesseract"]')) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => {
        console.log('Tesseract.js loaded successfully');
    };
    script.onerror = () => {
        console.error('Failed to load Tesseract.js');
        document.querySelector('.status-text').textContent = 'Failed to load OCR library';
    };
    document.head.appendChild(script);
}