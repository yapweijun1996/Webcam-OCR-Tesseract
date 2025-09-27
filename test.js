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

            // Convert image file to data URL for Tesseract, then preprocess (scale + binarize)
            const rawDataUrl = await this.fileToDataURL(this.selectedImageFile);
            const imageDataUrl = await this.preprocessImageForOCR(rawDataUrl);

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

            // Clean up the text result + re-extract key entities from image with strict models
            const baseClean = this.cleanOCRText(text);
            const entities = await this.extractEntitiesFromImage(imageDataUrl);
            const cleanedText = this.refineBusinessCardText(baseClean, entities);

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
                return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-()@_:+/';
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

        // Remove excessive special characters and symbols (keep meaningful punctuation)
        let cleaned = text
            .replace(/[{}[\]"'=*]+/g, '')      // hard symbols
            .replace(/[®©™•▫▪◆◇■□❖※‒–—―]+/g, '') // common noise from prints
            .replace(/\|/g, 'I');               // common OCR confusions

        // Remove stray punctuation around words
        cleaned = cleaned.replace(/\s+[;:]+/g, ' ').replace(/[;:]+\s+/g, ' ');

        // Email normalization (keep exact pattern)
        cleaned = cleaned.replace(/([A-Za-z0-9._%+-]+)\s*@\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '$1@$2');

        // Website normalization: "www .example .com" -> "www.example.com"
        cleaned = cleaned.replace(/www\s*\.\s*/gi, 'www.');
        cleaned = cleaned.replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2');
        cleaned = cleaned.replace(/\s*\/\s*/g, '/');

        // Phone normalization: compress and pretty print if US-like
        cleaned = cleaned.replace(/\(?(\d{3})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})/g, '($1) $2-$3');

        // Collapse whitespace but keep line breaks meaningful
        cleaned = cleaned.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');

        // Remove lines that are mostly symbols or too short to be useful
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter(line => {
            const symbolCount = (line.match(/[^A-Za-z0-9\s@.:/()-]/g) || []).length;
            const alphaNumCount = (line.match(/[A-Za-z0-9]/g) || []).length;
            return alphaNumCount >= 3 && alphaNumCount >= symbolCount;
        });

        return filteredLines.join('\n').trim();
    }
    // Further refine result: extract and normalize email/phone/website, drop noisy lines
    refineBusinessCardText(text, entities = {}) {
        if (!text) return '';

        // Extract likely entities from initial text
        let emailMatch = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
        let phoneMatch = text.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
        let webMatch = text.match(/(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)+(?:\/[^\s]*)?/);

        // Prefer strictly re-extracted entities if available
        if (entities.email) emailMatch = [entities.email];
        if (entities.website) webMatch = [entities.website];

        let lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

        // Stronger noise filtering
        lines = lines.filter(line => {
            const alnum = (line.match(/[A-Za-z0-9]/g) || []).length;
            const symbols = (line.match(/[^A-Za-z0-9\s.@:/()-]/g) || []).length;
            // require at least 4 alnum and symbols at most half of alnum
            return alnum >= 4 && symbols <= Math.max(1, Math.floor(alnum / 2));
        });

        // Deduplicate case-insensitive
        const seen = new Set();
        lines = lines.filter(l => {
            const key = l.toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Remove lines that look like leftover symbol noise
        lines = lines.filter(l => !/^[\s.:;'"`~^_|\\\-–—]+$/.test(l));

        // Inject canonical entities at the bottom (and remove worse duplicates)
        if (emailMatch) {
            const em = this.normalizeEmail(emailMatch[0]);
            lines = lines.filter(l => !/@/.test(l));
            lines.push(em);
        }
        if (phoneMatch) {
            const ph = this.normalizePhone(phoneMatch[0]);
            // remove any line that contains a 7+ sequence of digits mixed with separators
            lines = lines.filter(l => !/\d[\d\s().-]{6,}\d/.test(l));
            lines.push(ph);
        }
        if (webMatch) {
            const wb = this.normalizeWebsite(webMatch[0]);
            lines = lines.filter(l => !/(?:www|http)/i.test(l));
            lines.push(wb);
        }

        // Final domain spacing normalization
        lines = lines.map(l => l.replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2'));

        return lines.join('\n').trim();
    }

    normalizeEmail(s) {
        return s.replace(/\s+/g, '').toLowerCase();
    }

    normalizePhone(s) {
        const digits = (s.match(/\d/g) || []).join('');
        if (digits.length >= 10) {
            const d = digits.slice(-10);
            return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
        }
        return s.replace(/\s+/g, ' ').trim();
    }

    normalizeWebsite(s) {
        let t = s.trim();
        t = t.replace(/www\s*\.\s*/i, 'www.');
        t = t.replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2');
        t = t.replace(/\s*\/\s*/g, '/');
        if (!/^https?:\/\//i.test(t) && !/^www\./i.test(t)) t = 'www.' + t;
        return t.toLowerCase();
    }

    // Strict re-extraction of email and website with single-line PSM and limited charset
    async extractEntitiesFromImage(imageDataUrl) {
        const results = { email: null, website: null };
        try {
            // Email pass
            const emailRes = await Tesseract.recognize(
                imageDataUrl,
                'eng',
                {
                    logger: () => {},
                    tessedit_pageseg_mode: '7', // single line
                    tessedit_ocr_engine_mode: '2',
                    preserve_interword_spaces: '1',
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-@'
                }
            );
            const emailText = (emailRes?.data?.text || '').trim();
            const emailMatch = emailText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
            if (emailMatch) {
                results.email = emailMatch[0];
            }

            // Website pass
            const webRes = await Tesseract.recognize(
                imageDataUrl,
                'eng',
                {
                    logger: () => {},
                    tessedit_pageseg_mode: '7', // single line
                    tessedit_ocr_engine_mode: '2',
                    preserve_interword_spaces: '1',
                    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-/:'
                }
            );
            let webText = (webRes?.data?.text || '').trim();
            // Normalize spacing in domain
            webText = webText.replace(/www\s*\.\s*/gi, 'www.').replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2');
            const webMatch = webText.match(/(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?/);
            if (webMatch) {
                results.website = webMatch[0];
            }
        } catch (e) {
            console.warn('Entity re-extraction error:', e);
        }
        return results;
    }

    // Image preprocessing: scale 2x + grayscale + Otsu binarization for sharper OCR
    async preprocessImageForOCR(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const scale = 2;
                const w = Math.max(1, Math.floor(img.naturalWidth * scale));
                const h = Math.max(1, Math.floor(img.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                let imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;
                const gray = new Uint8Array(w * h);
                const hist = new Uint32Array(256);

                // Build grayscale + histogram
                for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                    const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                    gray[j] = g;
                    hist[g]++;
                }

                // Otsu threshold
                const threshold = this.otsuThreshold(hist, w * h);

                // Binarize
                for (let i = 0, j = 0; i < data.length; i += 4, j++) {
                    const v = gray[j] > threshold ? 255 : 0;
                    data[i] = data[i + 1] = data[i + 2] = v;
                    data[i + 3] = 255;
                }

                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            };
            img.crossOrigin = 'anonymous';
            img.src = dataUrl;
        });
    }

    otsuThreshold(hist, total) {
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * hist[i];

        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let varMax = 0;
        let threshold = 127;

        for (let i = 0; i < 256; i++) {
            wB += hist[i];
            if (wB === 0) continue;
            wF = total - wB;
            if (wF === 0) break;

            sumB += i * hist[i];

            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);

            if (between > varMax) {
                varMax = between;
                threshold = i;
            }
        }
        return threshold;
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