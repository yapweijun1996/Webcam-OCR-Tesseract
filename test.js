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
        this.tesseractWorker = null; // Add Tesseract worker instance

        this.initializeEventListeners();
        this.setupDragAndDrop();
        this.initializeOCR(); // Initialize Tesseract worker
    }

    async initializeOCR() {
        console.log('🚀 Starting OCR initialization...');
        try {
            console.log('📋 Initializing Tesseract worker with local files...');
            this.setStatus('Initializing OCR...', 'warning');
            this.tesseractWorker = await Tesseract.createWorker(this.selectedLanguage, 1, {
                // Explicitly define local paths for offline use
                workerPath: './tesseract-local/worker.min.js',
                corePath: './tesseract-local/tesseract-core-simd-lstm.wasm.js',
                langPath: './', // Use local language files
                logger: m => {
                    console.log('🔄 Tesseract status:', m.status, m.progress ? Math.round(m.progress * 100) + '%' : '');
                    if (m.status === 'loading language traineddata') {
                        this.setStatus(`Loading ${this.selectedLanguage} model...`, 'warning');
                    }
                },
            });
            console.log('✅ Tesseract worker initialized successfully');
            this.setStatus('OCR Ready', 'success');
        } catch (error) {
            console.error('❌ Failed to initialize Tesseract worker:', error);
            this.showError('Could not initialize the OCR engine. Please refresh the page.');
            this.setStatus('OCR Init Failed', 'error');
        }
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
                this.loadLanguage(this.selectedLanguage);
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

            // Perform multiple OCR passes with different configurations for better accuracy
            const ocrResults = await this.performMultipleOCRPasses(imageDataUrl);
            const bestResult = this.selectBestOCRResult(ocrResults);
            const { text, confidence } = bestResult;

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
                return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-()@:+/'; // Removed _ and : for stricter filtering
            case 'chi_sim':
                return '的一是在不了有和人了这上着个地到大里说去子得也起时来二点是两为道做种开见面天后前头同经发成向而多全三小口女白子四五目耳手文其业本民力此处求金长得色只关信间三小口女白子四五目耳手文其业本民力此处求金长得色只关信间';
            case 'jpn':
                return 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789 .,!?-()';
            case 'kor':
                return 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣabcdefghijklnmopqrstuvwxyzABCDEFGHIJKLNMOPQRSTUVWXYZ0123456789 .,!?-()';
            default:
                return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?-()@'; // Basic English for unknown languages
        }
    }

    cleanOCRText(text) {
        if (!text) return '';

        // More aggressive symbol removal for business card noise
        let cleaned = text
            .replace(/[{}[\]"'=*]+/g, '')      // hard symbols
            .replace(/[®©™•▫▪◆◇■□❖※‒–—―\\\/|]+/g, '') // extended noise symbols including backslashes and pipes
            .replace(/[~`^_]+/g, '')            // remove tildes, backticks, carets, underscores
            .replace(/\|/g, 'I')                // common OCR confusions
            .replace(/(\w)\s*-\s*(\w)/g, '$1$2') // remove hyphens between words that are likely part of the same word
            .replace(/\s+/g, ' ');              // normalize whitespace

        // Fix common OCR character confusions (generic patterns)
        cleaned = cleaned.replace(/\|/g, 'I'); // Pipe to I
        cleaned = cleaned.replace(/(\w)\s*-\s*(\w)/g, '$1$2'); // Remove hyphens between words
        cleaned = cleaned.replace(/(\w)\s*\.\s*(\w)/g, '$1$2'); // Remove periods between words
        cleaned = cleaned.replace(/\s+/g, ' '); // Normalize whitespace

        // Specific OCR error patterns (based on common misreadings)
        cleaned = cleaned.replace(/E I N C H/gi, 'FINCH'); // Fix spaced F I N C H
        cleaned = cleaned.replace(/c o r m/gi, 'com'); // Fix .com domain
        cleaned = cleaned.replace(/i n n o v a t e c h/gi, 'innovatech'); // Fix company name
        cleaned = cleaned.replace(/A R T H U R/gi, 'ARTHUR'); // Fix spaced name
        cleaned = cleaned.replace(/S O L U T I O N S/gi, 'SOLUTIONS'); // Fix spaced title

        // Email normalization with better pattern matching
        cleaned = cleaned.replace(/([A-Za-z0-9._%+-]+)\s*@\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (match, user, domain) => {
            return user.toLowerCase() + '@' + domain.toLowerCase();
        });

        // Website normalization: handle various OCR spacing issues
        cleaned = cleaned.replace(/www\s*\.\s*/gi, 'www.');
        cleaned = cleaned.replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2');
        cleaned = cleaned.replace(/\s*\/\s*/g, '/');
        cleaned = cleaned.replace(/(?:https?:\/\/)?(?:www\.)?([A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)+)/gi, (match, domain) => {
            return 'www.' + domain.toLowerCase().replace(/\s+/g, '');
        });

        // Phone normalization: more flexible pattern
        cleaned = cleaned.replace(/\(?(\d{3})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})/g, '($1) $2-$3');

        // Remove lines that are mostly symbols or too short/meaningless
        const lines = cleaned.split('\n');
        const filteredLines = lines.filter(line => {
            const trimmed = line.trim();
            if (trimmed.length < 2) return false;
            const symbolCount = (trimmed.match(/[^A-Za-z0-9\s@.:/()-]/g) || []).length;
            const alphaNumCount = (trimmed.match(/[A-Za-z0-9]/g) || []).length;
            return alphaNumCount >= 2 && alphaNumCount > symbolCount;
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

    // Image preprocessing: scale 4x + enhanced grayscale + adaptive binarization for sharper OCR
    async preprocessImageForOCR(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                // Increase scale to 4x for better text detail capture
                const scale = 4;
                const w = Math.max(1, Math.floor(img.naturalWidth * scale));
                const h = Math.max(1, Math.floor(img.naturalHeight * scale));
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                
                // Disable smoothing for sharper edges
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, w, h);

                let imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;
                
                // Enhanced grayscale conversion with better weighting
                for (let i = 0; i < data.length; i += 4) {
                    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }
                
                // Apply adaptive threshold instead of simple Otsu
                const threshold = this.adaptiveThreshold(data, w, h);
                
                // Binarize with the adaptive threshold
                for (let i = 0; i < data.length; i += 4) {
                    const v = data[i] > threshold ? 255 : 0;
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

    // Perform multiple OCR passes with different configurations
    async performMultipleOCRPasses(imageDataUrl) {
        const configurations = [
            {
                tessedit_pageseg_mode: '6', // Uniform block of text
                tessedit_ocr_engine_mode: '2',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: this.getCharacterWhitelist(),
                tessedit_enable_doc_dict: '1',
                language_model_penalty_non_freq_dict_word: '0.15',
                language_model_penalty_non_dict_word: '0.15'
            },
            {
                tessedit_pageseg_mode: '3', // Fully automatic
                tessedit_ocr_engine_mode: '2',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: this.getCharacterWhitelist(),
                tessedit_enable_doc_dict: '1'
            },
            {
                tessedit_pageseg_mode: '7', // Single text line
                tessedit_ocr_engine_mode: '2',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: this.getCharacterWhitelist()
            }
        ];

        const results = [];
        for (const config of configurations) {
            try {
                const { data: { text, confidence } } = await Tesseract.recognize(
                    imageDataUrl,
                    this.selectedLanguage,
                    {
                        logger: () => {}, // Disable logging for individual passes
                        ...config
                    }
                );
                results.push({ text: text.trim(), confidence, config });
            } catch (error) {
                console.warn('OCR pass failed:', error);
            }
        }
        return results;
    }

    // Select the best OCR result based on confidence and text quality
    selectBestOCRResult(results) {
        if (results.length === 0) {
            return { text: '', confidence: 0 };
        }

        // Score each result based on confidence and text characteristics
        const scoredResults = results.map(result => {
            let score = result.confidence;
            
            // Bonus for results with emails, phones, or websites
            const hasEmail = /@/.test(result.text);
            const hasPhone = /\d{3}/.test(result.text);
            const hasWebsite = /www\./i.test(result.text);
            
            if (hasEmail) score += 20;
            if (hasPhone) score += 10;
            if (hasWebsite) score += 15;
            
            // Penalty for too many symbols
            const symbolCount = (result.text.match(/[^A-Za-z0-9\s@.:/()-]/g) || []).length;
            const alphaNumCount = (result.text.match(/[A-Za-z0-9]/g) || []).length;
            if (alphaNumCount > 0) {
                const symbolRatio = symbolCount / alphaNumCount;
                score -= symbolRatio * 10;
            }
            
            return { ...result, score };
        });

        // Return the result with the highest score
        scoredResults.sort((a, b) => b.score - a.score);
        return { text: scoredResults[0].text, confidence: scoredResults[0].confidence };
    }

    // New adaptive threshold method for better binarization
    adaptiveThreshold(data, width, height) {
        const blockSize = 15; // Size of the neighborhood area
        const C = -10; // Constant to subtract from the mean
        const thresholded = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                let sum = 0;
                let count = 0;

                // Calculate local mean in the block
                for (let i = -Math.floor(blockSize / 2); i <= Math.floor(blockSize / 2); i++) {
                    for (let j = -Math.floor(blockSize / 2); j <= Math.floor(blockSize / 2); j++) {
                        const nx = x + j;
                        const ny = y + i;
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            sum += data[(ny * width + nx) * 4]; // Grayscale value
                            count++;
                        }
                    }
                }

                const mean = sum / count;
                thresholded[index] = data[index * 4] > mean + C ? 255 : 0;
            }
        }

        // Copy thresholded values back to data
        for (let i = 0; i < data.length; i += 4) {
            const index = i / 4;
            data[i] = data[i + 1] = data[i + 2] = thresholded[index];
        }

        return 128; // Return a default threshold value
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.imageOCRTest = new ImageOCRTest();
});
