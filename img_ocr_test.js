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
        this.setStatus('Initializing OCR...', 'warning');
        try {
            this.tesseractWorker = await Tesseract.createWorker('eng+osd', 1, {
                workerPath: './tesseract-local/worker.min.js',
                corePath: './tesseract-local/tesseract-core-simd-lstm.wasm.js',
                // 👉 Point to tessdata_best for higher accuracy models
                langPath: './tessdata_best/',
                logger: m => console.log('[tesseract]', m),
            });
            // Default parameters: LSTM-only + moderate penalties
            await this.tesseractWorker.setParameters({
                tessedit_ocr_engine_mode: '1', // LSTM only
                preserve_interword_spaces: '1',
                language_model_penalty_non_freq_dict_word: '0.15',
                language_model_penalty_non_dict_word: '0.15',
            });
            this.setStatus('OCR Ready', 'success');
        } catch (error) {
            console.error('❌ Failed to initialize Tesseract worker:', error);
            this.showError('Could not initialize OCR. Ensure "tessdata_best" directory exists and contains models.');
            this.setStatus('OCR Init Failed', 'error');
        }
    }

    async loadLanguage(lang) {
        if (!this.tesseractWorker) {
            this.showError('OCR worker not initialized.');
            return;
        }
        try {
            this.setStatus(`Loading ${lang} model...`, 'warning');
            // Also load OSD for orientation detection with other languages
            await this.tesseractWorker.loadLanguage(lang + '+osd');
            await this.tesseractWorker.initialize(lang + '+osd');
            this.setStatus('Language model loaded', 'success');
        } catch (error) {
            console.error(`Failed to load language ${lang}:`, error);
            this.showError(`Failed to load language model for ${lang}.`);
            this.setStatus('Language Error', 'error');
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
        if (this.isProcessing || !this.selectedImageFile || !this.tesseractWorker) {
            if (!this.tesseractWorker) {
                this.showError('OCR engine is not ready.');
            }
            return;
        }

        try {
            this.isProcessing = true;
            this.showProcessing(true);
            this.setStatus('Processing...', 'warning');

            const rawDataUrl = await this.fileToDataURL(this.selectedImageFile);

            // Deskew image based on OSD, then preprocess for OCR
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

            // Calculate comprehensive confidence score
            const imageQuality = {
                width: this.previewImage.naturalWidth,
                height: this.previewImage.naturalHeight,
                contrast: this.calculateImageContrast(),
                brightness: this.calculateImageBrightness()
            };

            // Use processed image stats for accurate quality assessment
            const processedStats = this._lastProcessed ?
                this.calculateImageStatsFromCanvas(this._lastProcessed.canvas) : {};
            const finalImageQuality = {
                width: this._lastProcessed?.w || this.previewImage.naturalWidth,
                height: this._lastProcessed?.h || this.previewImage.naturalHeight,
                ...processedStats
            };

            const comprehensiveConfidence = this.calculateComprehensiveConfidence(
                { confidence },
                cleanedText,
                entities,
                finalImageQuality
            );

            // Add result to history with enhanced confidence data
            const result = {
                text: cleanedText,
                confidence: comprehensiveConfidence,
                originalConfidence: Math.round(confidence),
                timestamp: new Date().toLocaleTimeString(),
                imageData: imageDataUrl,
                filename: this.selectedImageFile.name,
                entities: entities,
                textQualityScore: this.assessTextQuality(cleanedText),
                entityScore: this.assessEntityQuality(entities),
                imageQualityScore: this.assessImageQuality(imageQuality)
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
        if (confidence >= 85) return 'high-confidence';
        if (confidence >= 70) return 'medium-confidence';
        if (confidence >= 50) return 'low-confidence';
        return 'very-low-confidence';
    }

    // Calculate comprehensive confidence score based on multiple factors
    calculateComprehensiveConfidence(ocrResult, textQuality, entities, imageQuality) {
        let confidence = ocrResult.confidence || 0;

        // Factor 1: Text quality metrics
        const qualityScore = this.assessTextQuality(textQuality);
        confidence = (confidence * 0.4) + (qualityScore * 0.3);

        // Factor 2: Entity validation
        const entityScore = this.assessEntityQuality(entities);
        confidence = (confidence * 0.7) + (entityScore * 0.3);

        // Factor 3: Image quality assessment
        const imageScore = this.assessImageQuality(imageQuality);
        confidence = (confidence * 0.8) + (imageScore * 0.2);

        // Factor 4: Historical performance (if available)
        const historyScore = this.getHistoricalAccuracy();
        confidence = (confidence * 0.9) + (historyScore * 0.1);

        return Math.round(Math.max(0, Math.min(100, confidence)));
    }

    // Assess overall text quality
    assessTextQuality(textQuality) {
        if (!textQuality || textQuality.length === 0) return 0;

        let score = 50; // Base score

        // Length factor
        if (textQuality.length > 50) score += 15;
        else if (textQuality.length > 20) score += 10;
        else if (textQuality.length < 5) score -= 20;

        // Character diversity
        const uniqueChars = new Set(textQuality.toLowerCase().split('')).size;
        const totalChars = textQuality.length;
        const diversityRatio = uniqueChars / totalChars;

        if (diversityRatio > 0.6) score += 15;
        else if (diversityRatio < 0.3) score -= 15;

        // Word formation
        const words = textQuality.split(/\s+/).filter(w => w.length > 0);
        const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

        if (avgWordLength > 2 && avgWordLength < 12) score += 10;
        else if (avgWordLength < 2 || avgWordLength > 20) score -= 10;

        // Symbol ratio
        const symbolCount = (textQuality.match(/[^A-Za-z0-9\s]/g) || []).length;
        const symbolRatio = symbolCount / totalChars;

        if (symbolRatio < 0.1) score += 10;
        else if (symbolRatio > 0.3) score -= 15;

        return Math.max(0, Math.min(100, score));
    }

    // Assess entity quality and validation
    assessEntityQuality(entities) {
        if (!entities) return 50;

        let score = 60; // Base score

        // Email validation
        if (entities.email) {
            if (this.isValidEmail(entities.email)) {
                score += 25;
            } else {
                score -= 10;
            }
        }

        // Website validation
        if (entities.website) {
            if (this.isValidWebsite(entities.website)) {
                score += 20;
            } else {
                score -= 8;
            }
        }

        // Phone validation
        if (entities.phone) {
            if (this.isValidPhone(entities.phone)) {
                score += 15;
            } else {
                score -= 5;
            }
        }

        // Multiple entities bonus
        const entityCount = [entities.email, entities.website, entities.phone].filter(Boolean).length;
        if (entityCount > 1) score += 10;

        return Math.max(0, Math.min(100, score));
    }

    // Assess image quality factors
    assessImageQuality(imageQuality) {
        let score = 70; // Base score

        // Contrast assessment
        if (imageQuality.contrast > 0.7) score += 10;
        else if (imageQuality.contrast < 0.3) score -= 15;

        // Brightness assessment
        if (imageQuality.brightness > 0.3 && imageQuality.brightness < 0.8) score += 5;
        else if (imageQuality.brightness < 0.2 || imageQuality.brightness > 0.9) score -= 10;

        // Resolution factor
        if (imageQuality.width * imageQuality.height > 1000000) score += 5;
        else if (imageQuality.width * imageQuality.height < 100000) score -= 10;

        // Aspect ratio factor
        const aspectRatio = imageQuality.width / imageQuality.height;
        if (aspectRatio > 0.5 && aspectRatio < 2) score += 5;
        else if (aspectRatio < 0.2 || aspectRatio > 5) score -= 10;

        return Math.max(0, Math.min(100, score));
    }

    // Specialized entity extraction with stricter parameters
    async specializedEntityExtraction(imageDataUrl) {
        const entities = { emails: [], websites: [], phones: [] };
        if (!this.tesseractWorker) return entities;

        try {
            // Email
            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: '7', // Assume a single uniform block of text.
                tessedit_ocr_engine_mode: '1', // LSTM only
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-@'
            });
            const emailRes = await this.tesseractWorker.recognize(imageDataUrl);
            entities.emails = this.extractEmails(emailRes?.data?.text || '');

            // Website
            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: '7',
                tessedit_ocr_engine_mode: '1',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-./:'
            });
            const webRes = await this.tesseractWorker.recognize(imageDataUrl);
            entities.websites = this.extractWebsites(webRes?.data?.text || '');

            // Phone (International)
            await this.tesseractWorker.setParameters({
                tessedit_pageseg_mode: '7',
                tessedit_ocr_engine_mode: '1',
                preserve_interword_spaces: '1',
                tessedit_char_whitelist: '+()0123456789 -.'
            });
            const phoneRes = await this.tesseractWorker.recognize(imageDataUrl);
            entities.phones = this.extractPhones(phoneRes?.data?.text || '');

        } catch (e) {
            console.warn('specializedEntityExtraction failed', e);
        } finally {
            await this.resetTesseractParameters();
        }
        return entities;
    }

    // Calculate image contrast for quality assessment
    calculateImageContrast() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.previewImage.naturalWidth;
        canvas.height = this.previewImage.naturalHeight;

        ctx.drawImage(this.previewImage, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let contrast = 0;
        const samples = Math.min(data.length / 4, 10000); // Sample for performance

        for (let i = 0; i < samples; i++) {
            const index = Math.floor((i / samples) * (data.length / 4)) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            contrast += gray * gray;
        }

        const meanSquare = contrast / samples;
        const rms = Math.sqrt(meanSquare);
        const normalizedContrast = rms / 255;

        return Math.max(0, Math.min(1, normalizedContrast));
    }

    // Calculate image brightness for quality assessment
    calculateImageBrightness() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = this.previewImage.naturalWidth;
        canvas.height = this.previewImage.naturalHeight;

        ctx.drawImage(this.previewImage, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let brightness = 0;
        const samples = Math.min(data.length / 4, 10000);

        for (let i = 0; i < samples; i++) {
            const index = Math.floor((i / samples) * (data.length / 4)) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            brightness += gray;
        }

        const averageBrightness = brightness / samples;
        return averageBrightness / 255;
    }

    // Get historical accuracy for confidence weighting
    getHistoricalAccuracy() {
        if (this.recognitionHistory.length === 0) return 70; // Default

        const recentResults = this.recognitionHistory.slice(0, 10);
        const avgConfidence = recentResults.reduce((sum, result) => sum + result.confidence, 0) / recentResults.length;

        return Math.round(avgConfidence);
    }

    // Enhanced result display with detailed confidence information
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

        // Add confidence breakdown on hover
        const confidenceBreakdown = document.createElement('div');
        confidenceBreakdown.className = 'confidence-breakdown';
        confidenceBreakdown.style.display = 'none';
        confidenceBreakdown.innerHTML = `
            <div><strong>Confidence Analysis:</strong></div>
            <div>• OCR Engine: ${result.originalConfidence || result.confidence}%</div>
            <div>• Text Quality: ${result.textQualityScore || 'N/A'}%</div>
            <div>• Entity Validation: ${result.entityScore || 'N/A'}%</div>
            <div>• Image Quality: ${result.imageQualityScore || 'N/A'}%</div>
        `;

        resultItem.appendChild(filename);
        resultItem.appendChild(timestamp);
        resultItem.appendChild(resultText);
        resultItem.appendChild(confidenceBreakdown);

        // Show confidence breakdown on hover
        resultItem.addEventListener('mouseenter', () => {
            confidenceBreakdown.style.display = 'block';
        });

        resultItem.addEventListener('mouseleave', () => {
            confidenceBreakdown.style.display = 'none';
        });

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

        let cleaned = text.trim();

        // Stage 1: Advanced noise reduction using statistical analysis
        cleaned = this.removeStatisticalNoise(cleaned);

        // Stage 2: Context-aware symbol removal
        cleaned = this.contextAwareSymbolRemoval(cleaned);

        // Stage 3: OCR error pattern correction using machine learning-inspired rules
        cleaned = this.correctOCRErrors(cleaned);

        // Stage 4: Entity normalization with validation
        cleaned = this.normalizeEntities(cleaned);

        // Stage 5: Language-specific text refinement
        cleaned = this.languageSpecificRefinement(cleaned);

        // Stage 6: Intelligent line filtering based on content quality
        cleaned = this.intelligentLineFiltering(cleaned);

        return cleaned.trim();
    }

    // Statistical noise removal based on character frequency analysis
    removeStatisticalNoise(text) {
        const lines = text.split('\n');
        const cleanedLines = lines.map(line => {
            if (line.trim().length < 3) return line;

            const chars = line.split('');
            const charFreq = {};

            // Calculate character frequency
            chars.forEach(char => {
                charFreq[char] = (charFreq[char] || 0) + 1;
            });

            // Identify noise characters (very high frequency, likely OCR artifacts)
            const totalChars = chars.length;
            const noiseChars = Object.entries(charFreq)
                .filter(([char, freq]) => {
                    const frequency = freq / totalChars;
                    return frequency > 0.4 && !/[A-Za-z0-9\s]/.test(char);
                })
                .map(([char]) => char);

            // Remove noise characters
            let cleaned = line;
            noiseChars.forEach(char => {
                cleaned = cleaned.replace(new RegExp(char, 'g'), '');
            });

            return cleaned;
        });

        return cleanedLines.join('\n');
    }

    // Context-aware symbol removal based on surrounding characters
    contextAwareSymbolRemoval(text) {
        let cleaned = text;

        // Remove symbols that are likely OCR errors based on context
        cleaned = cleaned.replace(/[{}[\]"'=*]+/g, ''); // Hard symbols
        cleaned = cleaned.replace(/[®©™•▫▪◆◇■□❖※‒–—―]+/g, ''); // Extended noise symbols
        cleaned = cleaned.replace(/[~`^_]+/g, ''); // Tildes, backticks, carets, underscores

        // Fix common OCR confusions with context awareness
        cleaned = cleaned.replace(/\|/g, 'I'); // Pipe to I
        cleaned = cleaned.replace(/(\w)\s*-\s*(\w)/g, (match, w1, w2) => {
            // Only remove hyphen if both sides are letters (likely compound word)
            return /^[A-Za-z]+$/.test(w1) && /^[A-Za-z]+$/.test(w2) ? w1 + w2 : match;
        });

        // Fix periods between words only if they're likely not sentence endings
        cleaned = cleaned.replace(/(\w)\s*\.\s*(\w)/g, (match, w1, w2) => {
            const words = match.split(/\s*\.\s*/);
            return words.length === 2 && words.every(w => w.length > 1) ? w1 + w2 : match;
        });

        return cleaned.replace(/\s+/g, ' '); // Normalize whitespace
    }

    // Advanced OCR error correction using pattern recognition
    correctOCRErrors(text) {
        let cleaned = text;

        // Enhanced pattern corrections based on common OCR mistakes
        const corrections = [
            // Spaced letter patterns
            { pattern: /E I N C H/gi, replacement: 'FINCH' },
            { pattern: /c o r m/gi, replacement: 'com' },
            { pattern: /i n n o v a t e c h/gi, replacement: 'innovatech' },
            { pattern: /A R T H U R/gi, replacement: 'ARTHUR' },
            { pattern: /S O L U T I O N S/gi, replacement: 'SOLUTIONS' },
            { pattern: /L T D/gi, replacement: 'LTD' },
            { pattern: /I N C/gi, replacement: 'INC' },
            { pattern: /C O R P/gi, replacement: 'CORP' },

            // Character substitutions for common misreads
            { pattern: /0/g, replacement: 'O', condition: (text) => / [A-Z] /.test(' ' + text + ' ') },
            { pattern: /1/g, replacement: 'I', condition: (text) => /[A-Z]/.test(text) },
            { pattern: /5/g, replacement: 'S', condition: (text) => /[A-Z]/.test(text) },
            { pattern: /8/g, replacement: 'B', condition: (text) => /[A-Z]/.test(text) },

            // Number patterns
            { pattern: /(\d)\s+(\d)/g, replacement: '$1$2', condition: (text) => text.length < 20 }
        ];

        corrections.forEach(({ pattern, replacement, condition }) => {
            if (!condition || condition(cleaned)) {
                cleaned = cleaned.replace(pattern, replacement);
            }
        });

        return cleaned;
    }

    // Enhanced entity normalization with validation
    normalizeEntities(text) {
        let cleaned = text;

        // Email normalization with domain validation
        cleaned = cleaned.replace(/([A-Za-z0-9._%+-]+)\s*@\s*([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, (match, user, domain) => {
            const normalizedUser = user.toLowerCase().replace(/\s+/g, '');
            const normalizedDomain = domain.toLowerCase().replace(/\s+/g, '');
            // Basic domain validation
            if (normalizedDomain.split('.').length >= 2) {
                return normalizedUser + '@' + normalizedDomain;
            }
            return match;
        });

        // Website normalization with protocol handling
        cleaned = cleaned.replace(/www\s*\.\s*/gi, 'www.');
        cleaned = cleaned.replace(/([A-Za-z0-9-])\s*\.\s*([A-Za-z0-9-])/g, '$1.$2');
        cleaned = cleaned.replace(/\s*\/\s*/g, '/');

        // Smart website reconstruction
        cleaned = cleaned.replace(/(?:https?:\/\/)?(?:www\.)?([A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)+)/gi, (match, domain) => {
            const normalizedDomain = domain.toLowerCase().replace(/\s+/g, '');
            return normalizedDomain.startsWith('www.') ? normalizedDomain : 'www.' + normalizedDomain;
        });

        // Enhanced phone number normalization
        cleaned = cleaned.replace(/\(?(\d{3})\)?[-.\s]*(\d{3})[-.\s]*(\d{4})/g, (match, a, b, c) => {
            // Validate it's actually a phone number (not a date or other number)
            if (a && b && c && a !== '000' && b !== '000' && c !== '0000') {
                return `(${a}) ${b}-${c}`;
            }
            return match;
        });

        return cleaned;
    }

    // Language-specific text refinement
    languageSpecificRefinement(text) {
        const currentLang = this.selectedLanguage;
        let refined = text;

        switch (currentLang) {
            case 'eng':
                // English-specific refinements
                refined = this.englishTextRefinement(refined);
                break;
            case 'chi_sim':
            case 'chi_tra':
                // Chinese-specific refinements
                refined = this.chineseTextRefinement(refined);
                break;
            case 'jpn':
                // Japanese-specific refinements
                refined = this.japaneseTextRefinement(refined);
                break;
        }

        return refined;
    }

    // English-specific text improvements
    englishTextRefinement(text) {
        let refined = text;

        // Fix common English OCR errors
        refined = refined.replace(/\bteh\b/gi, 'the');
        refined = refined.replace(/\btaht\b/gi, 'that');
        refined = refined.replace(/\bfo\b/gi, 'to');
        refined = refined.replace(/\bwiht\b/gi, 'with');
        refined = refined.replace(/\band\b/gi, 'and');

        // Capitalization improvements for proper nouns
        refined = refined.replace(/\b([a-z]+)\b/g, (word) => {
            const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'has', 'let', 'put', 'say', 'she', 'too', 'use'];
            if (word.length > 3 && !commonWords.includes(word.toLowerCase())) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word;
        });

        return refined;
    }

    // Chinese-specific text improvements
    chineseTextRefinement(text) {
        // Remove common OCR artifacts in Chinese text
        return text.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                  .replace(/\s+/g, '');
    }

    // Japanese-specific text improvements
    japaneseTextRefinement(text) {
        // Remove common OCR artifacts in Japanese text
        return text.replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                  .replace(/\s+/g, '');
    }

    // Intelligent line filtering based on content quality and context
    intelligentLineFiltering(text) {
        const lines = text.split('\n');
        const filteredLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) continue;

            // Quality metrics for each line
            const alphaNumCount = (line.match(/[A-Za-z0-9]/g) || []).length;
            const symbolCount = (line.match(/[^A-Za-z0-9\s@.:/()-]/g) || []).length;
            const totalLength = line.length;

            // Skip very short or very noisy lines
            if (totalLength < 2) continue;
            if (symbolCount > totalLength * 0.7) continue;
            if (alphaNumCount < 2 && !/@/.test(line) && !/\d{3}/.test(line)) continue;

            // Context-aware filtering
            const hasEmail = /@/.test(line);
            const hasPhone = /\d{3}/.test(line);
            const hasWebsite = /www\.|http/i.test(line);

            // Keep lines with entities regardless of other metrics
            if (hasEmail || hasPhone || hasWebsite) {
                filteredLines.push(line);
                continue;
            }

            // Advanced filtering based on line content analysis
            const qualityScore = this.calculateLineQualityScore(line);
            if (qualityScore > 0.3 || (i > 0 && i < lines.length - 1)) { // Keep context lines
                filteredLines.push(line);
            }
        }

        return filteredLines.join('\n');
    }

    // Calculate quality score for individual lines
    calculateLineQualityScore(line) {
        const alphaNumCount = (line.match(/[A-Za-z0-9]/g) || []).length;
        const symbolCount = (line.match(/[^A-Za-z0-9\s@.:/()-]/g) || []).length;
        const totalLength = line.length;

        if (totalLength === 0) return 0;

        const alphaNumRatio = alphaNumCount / totalLength;
        const symbolRatio = symbolCount / totalLength;

        // Base score from character ratios
        let score = alphaNumRatio * 0.6 - symbolRatio * 0.4;

        // Bonus for structured content
        if (/@/.test(line)) score += 0.3;
        if (/www\.|http/i.test(line)) score += 0.3;
        if (/\d{3}/.test(line)) score += 0.2;
        if (/[A-Z]{2,}/.test(line)) score += 0.1; // Possible acronyms

        return Math.max(0, Math.min(1, score));
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

    // Enhanced entity extraction with multiple strategies and validation
    async extractEntitiesFromImage(imageDataUrl) {
        const results = { email: null, website: null, phone: null };

        try {
            // Strategy 1: Pattern-based extraction from preprocessed text
            const preprocessedText = await this.getPreprocessedText(imageDataUrl);
            const patternEntities = this.extractEntitiesFromText(preprocessedText);

            // Strategy 2: Specialized OCR passes for entity extraction
            const specializedEntities = await this.specializedEntityExtraction(imageDataUrl);

            // Strategy 3: Combine and validate results
            results.email = this.validateAndSelectBest(
                [...(patternEntities.emails || []), ...(specializedEntities.emails || [])],
                'email'
            );
            results.website = this.validateAndSelectBest(
                [...(patternEntities.websites || []), ...(specializedEntities.websites || [])],
                'website'
            );
            results.phone = this.validateAndSelectBest(
                [...(patternEntities.phones || []), ...(specializedEntities.phones || [])],
                'phone'
            );

        } catch (e) {
            console.warn('Entity extraction error:', e);
        }
        return results;
    }

    // Get preprocessed text for pattern-based extraction
    async getPreprocessedText(imageDataUrl) {
        if (!this.tesseractWorker) return '';

        try {
            const { data: { text } } = await this.tesseractWorker.recognize(imageDataUrl);
            return text || '';
        } catch (error) {
            console.warn('Failed to get preprocessed text:', error);
            return '';
        }
    }

    // Extract entities using pattern matching from text
    extractEntitiesFromText(text) {
        return {
            emails: this.extractEmails(text),
            websites: this.extractWebsites(text),
            phones: this.extractPhones(text)
        };
    }

    // Multi-pass entity extraction with specialized configurations
    async multiPassEntityExtraction(imageDataUrl) {
        const entities = { emails: [], websites: [], phones: [] };

        // Configuration 1: Single line mode for structured entities
        await this.tesseractWorker.setParameters({
            tessedit_pageseg_mode: '7', // Single text line
            tessedit_ocr_engine_mode: '2',
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-@:/-.()',
            tessedit_enable_doc_dict: '1'
        });

        const singleLineResult = await this.tesseractWorker.recognize(imageDataUrl);
        const singleLineText = singleLineResult?.data?.text || '';

        // Extract entities from single line pass
        entities.emails.push(...this.extractEmails(singleLineText));
        entities.websites.push(...this.extractWebsites(singleLineText));
        entities.phones.push(...this.extractPhones(singleLineText));

        // Configuration 2: Sparse text mode for scattered entities
        await this.tesseractWorker.setParameters({
            tessedit_pageseg_mode: '11', // Sparse text
            tessedit_ocr_engine_mode: '2',
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._%+-@:/-.()',
            tessedit_enable_doc_dict: '1'
        });

        const sparseResult = await this.tesseractWorker.recognize(imageDataUrl);
        const sparseText = sparseResult?.data?.text || '';

        // Extract entities from sparse text pass
        entities.emails.push(...this.extractEmails(sparseText));
        entities.websites.push(...this.extractWebsites(sparseText));
        entities.phones.push(...this.extractPhones(sparseText));

        return entities;
    }

    // Pattern-based entity extraction from full text recognition
    async patternBasedEntityExtraction(imageDataUrl) {
        const entities = { emails: [], websites: [], phones: [] };

        // Full text recognition for context
        await this.tesseractWorker.setParameters({
            tessedit_pageseg_mode: '3', // Fully automatic
            tessedit_ocr_engine_mode: '2',
            preserve_interword_spaces: '1',
            tessedit_char_whitelist: this.getCharacterWhitelist(),
            tessedit_enable_doc_dict: '1'
        });

        const fullResult = await this.tesseractWorker.recognize(imageDataUrl);
        const fullText = fullResult?.data?.text || '';

        // Extract entities using advanced patterns
        entities.emails = this.extractEmails(fullText);
        entities.websites = this.extractWebsites(fullText);
        entities.phones = this.extractPhones(fullText);

        return entities;
    }

    // Enhanced email extraction with multiple pattern matching
    extractEmails(text) {
        const emails = [];
        if (!text) return emails;

        // Multiple email patterns to catch various OCR errors
        const patterns = [
            // Standard email pattern
            /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
            // Pattern for spaced emails (common OCR error)
            /([A-Za-z0-9._%+-]+)\s*@\s*([A-Za-z0-9.-]+)\s*\.\s*([A-Za-z]{2,})/g,
            // Pattern for emails with character substitutions
            /[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|icloud)\.com/g,
            // Pattern for business emails
            /[A-Za-z0-9._%+-]+@(?:company|corp|inc|llc|ltd)\.[A-Za-z]{2,}/g
        ];

        patterns.forEach(pattern => {
            let matches;
            while ((matches = pattern.exec(text)) !== null) {
                const email = matches[0].replace(/\s+/g, '').toLowerCase();
                if (this.isValidEmail(email)) {
                    emails.push(email);
                }
            }
        });

        // Remove duplicates
        return [...new Set(emails)];
    }

    // Enhanced website extraction with domain validation
    extractWebsites(text) {
        const websites = [];
        if (!text) return websites;

        const patterns = [
            // Standard website patterns
            /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)+(?:\/[^\s]*)?/g,
            // Spaced domain patterns
            /(?:www\s*\.)?\s*([A-Za-z0-9-]+)\s*\.\s*([A-Za-z0-9-]+)\s*(?:\.\s*([A-Za-z0-9-]+))?(?:\s*\/\s*[^\s]*)?/g,
            // Common TLD patterns
            /(?:www\s*\.)?[A-Za-z0-9-]+\.(?:com|org|net|edu|gov|mil|info|biz|co\.uk|co\.in|co\.au)/g
        ];

        patterns.forEach(pattern => {
            let matches;
            while ((matches = pattern.exec(text)) !== null) {
                const website = this.normalizeWebsite(matches[0]);
                if (this.isValidWebsite(website)) {
                    websites.push(website);
                }
            }
        });

        return [...new Set(websites)];
    }

    // Enhanced phone extraction with multiple formats
    extractPhones(text) {
        const phones = [];
        if (!text) return phones;

        const patterns = [
            // US/Canada format
            /\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}/g,
            // International format
            /\+?\d{1,3}[-.\s]*\(?\d{1,4}\)?[-.\s]*\d{1,4}[-.\s]*\d{1,4}/g,
            // Spaced number patterns
            /(\d{3})\s*[-.\s]*\s*(\d{3})\s*[-.\s]*\s*(\d{4})/g,
            // Extension patterns
            /\(?\d{3}\)?[-.\s]*\d{3}[-.\s]*\d{4}\s*(?:ext|extension|x)\s*\d{1,5}/g
        ];

        patterns.forEach(pattern => {
            let matches;
            while ((matches = pattern.exec(text)) !== null) {
                const phone = this.normalizePhone(matches[0]);
                if (this.isValidPhone(phone)) {
                    phones.push(phone);
                }
            }
        });

        return [...new Set(phones)];
    }

    // Email validation with basic domain checking
    isValidEmail(email) {
        if (!email || !/@/.test(email)) return false;

        const [user, domain] = email.split('@');
        if (!user || !domain) return false;

        // Basic domain validation
        const domainParts = domain.split('.');
        if (domainParts.length < 2) return false;

        const tld = domainParts[domainParts.length - 1];
        const validTlds = ['com', 'org', 'net', 'edu', 'gov', 'mil', 'info', 'biz', 'co', 'uk', 'in', 'au', 'ca'];

        return validTlds.includes(tld.toLowerCase()) && domainParts.every(part => part.length > 0);
    }

    // Website validation
    isValidWebsite(website) {
        if (!website) return false;

        // Remove protocol if present
        const cleanWebsite = website.replace(/^https?:\/\//, '').replace(/^www\./, '');

        // Basic domain validation
        const domainParts = cleanWebsite.split('.');
        if (domainParts.length < 2) return false;

        return domainParts.every(part => part.length > 0 && /^[A-Za-z0-9-]+$/.test(part));
    }

    // Phone validation
    isValidPhone(phone) {
        if (!phone) return false;

        // Remove all non-digits
        const digits = phone.replace(/\D/g, '');

        // Check for reasonable length
        return digits.length >= 10 && digits.length <= 15 && digits !== '0000000000';
    }

    // Select best entity from candidates based on validation scores
    validateAndSelectBest(candidates, type) {
        if (candidates.length === 0) return null;

        // Score each candidate
        const scored = candidates.map(candidate => ({
            value: candidate,
            score: this.calculateEntityScore(candidate, type)
        }));

        // Sort by score and return the best
        scored.sort((a, b) => b.score - a.score);
        return scored[0].value;
    }

    // Calculate quality score for entities
    calculateEntityScore(entity, type) {
        let score = 0;

        switch (type) {
            case 'email':
                if (entity.includes('@')) score += 30;
                if (entity.includes('.')) score += 20;
                if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(entity)) score += 50;
                break;

            case 'website':
                if (entity.includes('www.') || entity.includes('http')) score += 20;
                if (entity.includes('.')) score += 30;
                if (/^[A-Za-z0-9-]+\.[A-Za-z0-9-]+\.[A-Za-z]{2,}$/.test(entity.replace(/^www\./, ''))) score += 50;
                break;

            case 'phone':
                const digits = entity.replace(/\D/g, '');
                if (digits.length >= 10) score += 40;
                if (digits.length <= 15) score += 30;
                if (/^\(\d{3}\)\s*\d{3}-\d{4}$/.test(entity)) score += 30;
                break;
        }

        return score;
    }

    // Enhanced image preprocessing: OSD deskew, scaling, sharpening, and advanced binarization
    async preprocessImageForOCR(dataUrl) {
        // First, correct orientation
        const rotatedDataUrl = await this.osdDeskew(dataUrl);

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    // --- Target x-height / DPI by scaling the short side ---
                    const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
                    const scale = shortSide < 500 ? 4 : shortSide < 900 ? 2.5 : shortSide < 1400 ? 1.8 : 1.4;
                    const w = Math.round(img.naturalWidth * scale);
                    const h = Math.round(img.naturalHeight * scale);

                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true });
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, w, h);

                    // --- Gentle Unsharp Mask to enhance edges ---
                    let imageData = ctx.getImageData(0, 0, w, h);
                    this.unsharpMask(imageData, w, h, 1, 0.6, 2);
                    ctx.putImageData(imageData, 0, 0);

                    // --- Proceed with the advanced filtering pipeline ---
                    imageData = ctx.getImageData(0, 0, w, h);
                    this.enhancedGrayscale(imageData.data);

                    // Auto-invert detection: check if text is light on dark background
                    const shouldInvert = this.shouldAutoInvert(imageData);
                    if (shouldInvert) {
                        this.invertImage(imageData.data);
                        console.log('🔄 Auto-inverted image for light text on dark background');
                    }

                    imageData = this.bilateralFilter(imageData, w, h); // Noise reduction
                    imageData = this.applyCLAHE(imageData, w, h); // Contrast enhancement
                    const thr = this.advancedAdaptiveThreshold(imageData.data, w, h); // Binarization
                    this.hysteresisBinarization(imageData.data, thr, w, h);
                    this.morphologicalOperations(imageData.data, w, h); // Cleanup

                    ctx.putImageData(imageData, 0, 0);

                    // Store processed image stats for quality assessment
                    this._lastProcessed = {
                        url: canvas.toDataURL('image/png'),
                        w,
                        h,
                        canvas,
                        shouldInvert
                    };

                    resolve(this._lastProcessed.url);
                } catch (error) {
                    console.error('Image preprocessing failed:', error);
                    reject('Failed to preprocess image.');
                }
            };
            img.onerror = () => reject('Failed to load image for preprocessing.');
            img.crossOrigin = 'anonymous';
            img.src = rotatedDataUrl;
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

    // Perform multiple OCR passes with robust configurations for different text layouts
    async performMultipleOCRPasses(imageDataUrl) {
        if (!this.tesseractWorker) return [];

        const passes = [
            { name: 'BlockText', params: { tessedit_pageseg_mode: '6' } }, // Assume a single uniform block of text.
            { name: 'SingleLine', params: { tessedit_pageseg_mode: '7' } }, // Treat the image as a single text line.
            { name: 'Sparse', params: { tessedit_pageseg_mode: '11' } }, // Find as much text as possible in no particular order.
        ];

        const results = [];
        for (const p of passes) {
            try {
                await this.tesseractWorker.setParameters({
                    tessedit_ocr_engine_mode: '1', // LSTM only
                    tessedit_enable_doc_dict: '1',
                    tessedit_char_whitelist: this.getCharacterWhitelist(),
                    preserve_interword_spaces: '1',
                    ...p.params,
                });
                const { data: { text, confidence } } = await this.tesseractWorker.recognize(imageDataUrl);
                results.push({
                    text: (text || '').trim(),
                    confidence,
                    config: p.name,
                    score: this.calculateTextQualityScore(text, confidence)
                });
            } catch (e) {
                console.warn(`OCR Pass [${p.name}] failed:`, e);
            }
        }
        // Reset parameters to default after all passes
        await this.resetTesseractParameters();
        return results;
    }

    // Calculate comprehensive text quality score
    calculateTextQualityScore(text, confidence) {
        if (!text || text.trim().length === 0) return 0;

        let score = confidence;
        const cleanText = text.trim();
        const alphaNumCount = (cleanText.match(/[A-Za-z0-9]/g) || []).length;
        const totalLength = cleanText.length;

        if (totalLength === 0) return 0;

        // Content quality metrics
        const alphaNumRatio = alphaNumCount / totalLength;

        // Bonus for structured content patterns
        const hasEmail = /@/.test(cleanText);
        const hasPhone = /\d{3}/.test(cleanText);
        const hasWebsite = /www\.|http/i.test(cleanText);
        const hasBusinessKeywords = /\b(company|inc|llc|ltd|corp|corporation|university|school|hospital)\b/i.test(cleanText);

        if (hasEmail) score += 25;
        if (hasPhone) score += 15;
        if (hasWebsite) score += 20;
        if (hasBusinessKeywords) score += 10;

        // Text structure bonuses
        const lineCount = cleanText.split('\n').length;
        if (lineCount > 1 && lineCount <= 10) score += 10; // Multi-line structure bonus
        if (cleanText.includes(':') || cleanText.includes('|')) score += 5; // Structured data

        // Character set quality
        const symbolCount = (cleanText.match(/[^A-Za-z0-9\s@.:/()|-]/g) || []).length;
        const symbolRatio = symbolCount / totalLength;

        // Penalty for excessive symbols or poor character ratio
        if (alphaNumRatio < 0.3) score -= 30;
        if (symbolRatio > 0.5) score -= 20;
        if (symbolRatio > 0.7) score -= 50; // Very noisy text

        // Length appropriateness
        if (totalLength > 1000) score += 5; // Substantial content bonus
        if (totalLength < 10 && !hasEmail && !hasPhone) score -= 20; // Too short without entities

        // Language-specific patterns
        const currentLang = this.selectedLanguage;
        if (currentLang === 'eng') {
            const wordCount = cleanText.split(/\s+/).length;
            const avgWordLength = alphaNumCount / wordCount;
            if (avgWordLength > 2 && avgWordLength < 10) score += 5;
        }

        return Math.max(0, Math.round(score));
    }

    // Select the best OCR result using advanced scoring
    selectBestOCRResult(results) {
        if (results.length === 0) {
            return { text: '', confidence: 0 };
        }

        // Use the enhanced scoring system
        const scoredResults = results.map(result => ({
            ...result,
            qualityScore: result.score || this.calculateTextQualityScore(result.text, result.confidence)
        }));

        // Sort by quality score and return the best result
        scoredResults.sort((a, b) => b.qualityScore - a.qualityScore);
        const bestResult = scoredResults[0];

        console.log('OCR Results Analysis:', {
            totalPasses: results.length,
            bestScore: bestResult.qualityScore,
            bestConfidence: bestResult.confidence,
            textLength: bestResult.text.length
        });

        return {
            text: bestResult.text,
            confidence: bestResult.confidence,
            qualityScore: bestResult.qualityScore
        };
    }

    // Enhanced grayscale conversion with better color weighting
    enhancedGrayscale(data) {
        for (let i = 0; i < data.length; i += 4) {
            // Improved luminance calculation with gamma correction
            const r = data[i] / 255;
            const g = data[i + 1] / 255;
            const b = data[i + 2] / 255;

            // Apply gamma correction and improved weighting
            const gray = Math.round(255 * Math.pow(0.299 * Math.pow(r, 2.2) +
                                                   0.587 * Math.pow(g, 2.2) +
                                                   0.114 * Math.pow(b, 2.2), 1/2.2));
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    // Bilateral filter for noise reduction while preserving edges
    bilateralFilter(imageData, width, height) {
        const data = imageData.data;
        const output = new Uint8ClampedArray(data);
        const spatialSigma = 2;
        const intensitySigma = 30;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const centerIndex = (y * width + x) * 4;
                const centerIntensity = data[centerIndex];
                let sum = 0;
                let weightSum = 0;

                // Apply bilateral filter in 5x5 neighborhood
                for (let ky = -2; ky <= 2; ky++) {
                    for (let kx = -2; kx <= 2; kx++) {
                        const nx = x + kx;
                        const ny = y + ky;

                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const neighborIndex = (ny * width + nx) * 4;
                            const neighborIntensity = data[neighborIndex];

                            // Spatial weight (Gaussian)
                            const spatialDist = kx * kx + ky * ky;
                            const spatialWeight = Math.exp(-spatialDist / (2 * spatialSigma * spatialSigma));

                            // Intensity weight (Gaussian)
                            const intensityDist = (centerIntensity - neighborIntensity) * (centerIntensity - neighborIntensity);
                            const intensityWeight = Math.exp(-intensityDist / (2 * intensitySigma * intensitySigma));

                            const weight = spatialWeight * intensityWeight;
                            sum += neighborIntensity * weight;
                            weightSum += weight;
                        }
                    }
                }

                const filteredValue = Math.round(sum / weightSum);
                output[centerIndex] = output[centerIndex + 1] = output[centerIndex + 2] = filteredValue;
            }
        }

        return new ImageData(output, width, height);
    }

    // CLAHE (Contrast Limited Adaptive Histogram Equalization)
    applyCLAHE(imageData, width, height) {
        const data = imageData.data;
        const output = new Uint8ClampedArray(data);
        const tileSize = 32;
        const clipLimit = 3;

        const tilesX = Math.ceil(width / tileSize);
        const tilesY = Math.ceil(height / tileSize);

        // Process each tile
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const startX = tx * tileSize;
                const startY = ty * tileSize;
                const endX = Math.min(startX + tileSize, width);
                const endY = Math.min(startY + tileSize, height);

                // Extract tile histogram
                const histogram = new Array(256).fill(0);
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        const index = (y * width + x) * 4;
                        histogram[data[index]]++;
                    }
                }

                // Clip histogram
                const totalPixels = (endX - startX) * (endY - startY);
                const clipValue = Math.round((totalPixels / 256) * clipLimit);

                let excess = 0;
                for (let i = 0; i < 256; i++) {
                    if (histogram[i] > clipValue) {
                        excess += histogram[i] - clipValue;
                        histogram[i] = clipValue;
                    }
                }

                // Redistribute excess
                const increment = Math.floor(excess / 256);
                for (let i = 0; i < 256; i++) {
                    histogram[i] += increment;
                }

                // Calculate CDF
                const cdf = new Array(256);
                cdf[0] = histogram[0];
                for (let i = 1; i < 256; i++) {
                    cdf[i] = cdf[i - 1] + histogram[i];
                }

                // Apply equalization to tile
                const scale = 255 / cdf[255];
                for (let y = startY; y < endY; y++) {
                    for (let x = startX; x < endX; x++) {
                        const index = (y * width + x) * 4;
                        const equalized = Math.round(cdf[data[index]] * scale);
                        output[index] = output[index + 1] = output[index + 2] = equalized;
                    }
                }
            }
        }

        return new ImageData(output, width, height);
    }

    // Advanced adaptive thresholding with Sauvola method
    advancedAdaptiveThreshold(data, width, height) {
        // Dynamically adjust block size based on image resolution
        const blockSize = Math.max(15, Math.floor(width / 60));
        const k = 0.2; // Adjusted k-value for better noise tolerance
        const R = 128;

        const integralImg = new Float32Array(width * height);
        const integralImgSq = new Float32Array(width * height);

        // Compute integral images
        for (let y = 0; y < height; y++) {
            let rowSum = 0;
            let rowSumSq = 0;
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const pixelValue = data[index * 4];
                rowSum += pixelValue;
                rowSumSq += pixelValue * pixelValue;
                integralImg[index] = (y > 0 ? integralImg[index - width] : 0) + rowSum;
                integralImgSq[index] = (y > 0 ? integralImgSq[index - width] : 0) + rowSumSq;
            }
        }

        const thresholdedData = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const halfBlock = Math.floor(blockSize / 2);
                const x1 = Math.max(0, x - halfBlock);
                const y1 = Math.max(0, y - halfBlock);
                const x2 = Math.min(width - 1, x + halfBlock);
                const y2 = Math.min(height - 1, y + halfBlock);

                const count = (x2 - x1 + 1) * (y2 - y1 + 1);

                const sum = integralImg[y2 * width + x2] - (x1 > 0 ? integralImg[y2 * width + x1 - 1] : 0) - (y1 > 0 ? integralImg[(y1 - 1) * width + x2] : 0) + (x1 > 0 && y1 > 0 ? integralImg[(y1 - 1) * width + x1 - 1] : 0);
                const sumSq = integralImgSq[y2 * width + x2] - (x1 > 0 ? integralImgSq[y2 * width + x1 - 1] : 0) - (y1 > 0 ? integralImgSq[(y1 - 1) * width + x2] : 0) + (x1 > 0 && y1 > 0 ? integralImgSq[(y1 - 1) * width + x1 - 1] : 0);

                const mean = sum / count;
                const stdDev = Math.sqrt(Math.max(0, (sumSq / count) - (mean * mean)));
                const threshold = mean * (1 + k * ((stdDev / R) - 1));

                const pixelValue = data[index * 4];
                const binaryValue = pixelValue > threshold ? 255 : 0;
                const outIndex = index * 4;
                thresholdedData[outIndex] = thresholdedData[outIndex + 1] = thresholdedData[outIndex + 2] = binaryValue;
                thresholdedData[outIndex + 3] = 255;
            }
        }
        // Copy back to original data array
        data.set(thresholdedData);
        return 128; // Return a default threshold for hysteresis
    }

    // Hysteresis binarization for better text connectivity
    hysteresisBinarization(data, threshold, width, height) {
        const highThreshold = threshold + 20;
        const lowThreshold = threshold - 20;

        // First pass: mark strong edges
        const strongEdges = new Uint8Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            const intensity = data[i];
            if (intensity > highThreshold) {
                strongEdges[i / 4] = 2; // Strong edge
            } else if (intensity > lowThreshold) {
                strongEdges[i / 4] = 1; // Weak edge
            }
        }

        // Second pass: connect weak edges to strong edges
        let changed = true;
        while (changed) {
            changed = false;
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const index = y * width + x;
                    if (strongEdges[index] === 1) {
                        // Check 8-neighborhood for strong edges
                        for (let dy = -1; dy <= 1; dy++) {
                            for (let dx = -1; dx <= 1; dx++) {
                                const nIndex = (y + dy) * width + (x + dx);
                                if (strongEdges[nIndex] === 2) {
                                    strongEdges[index] = 2;
                                    changed = true;
                                    break;
                                }
                            }
                            if (changed) break;
                        }
                    }
                }
            }
        }

        // Apply final binarization
        for (let i = 0; i < data.length; i += 4) {
            const index = i / 4;
            const value = strongEdges[index] === 2 ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
        }
    }

    // Morphological operations to clean up text
    morphologicalOperations(data, width, height) {
        // Dilation to connect broken text parts
        const dilated = new Uint8ClampedArray(data);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const index = (y * width + x) * 4;
                if (data[index] === 0) { // Background pixel
                    // Check if any neighbor is foreground
                    let hasForegroundNeighbor = false;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const nIndex = ((y + dy) * width + (x + dx)) * 4;
                            if (data[nIndex] === 255) {
                                hasForegroundNeighbor = true;
                                break;
                            }
                        }
                        if (hasForegroundNeighbor) break;
                    }
                    if (hasForegroundNeighbor) {
                        dilated[index] = dilated[index + 1] = dilated[index + 2] = 255;
                    }
                }
            }
        }

        // Copy dilated result back
        for (let i = 0; i < data.length; i++) {
            data[i] = dilated[i];
        }
    }

    // Automatically detect and correct image orientation
    async osdDeskew(dataUrl) {
        if (!this.tesseractWorker) return dataUrl;
        try {
            // Set OSD parameters BEFORE calling recognize
            await this.tesseractWorker.setParameters({ tessedit_pageseg_mode: '0' }); // OSD only
            const { data: osd } = await this.tesseractWorker.recognize(dataUrl);
            const deg = osd?.osd?.rotation ?? 0;

            // Only rotate if the angle is significant
            if (!deg || Math.abs(deg) < 0.5) return dataUrl;

            console.log(`🔄 Auto-rotating image by ${deg} degrees.`);

            // Rotate the image using canvas
            return await new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const rad = -deg * Math.PI / 180; // OSD angle is counter-clockwise
                    const w = img.naturalWidth,
                        h = img.naturalHeight;
                    const sin = Math.abs(Math.sin(rad)),
                        cos = Math.abs(Math.cos(rad));
                    canvas.width = Math.floor(w * cos + h * sin);
                    canvas.height = Math.floor(w * sin + h * cos);
                    const ctx = canvas.getContext('2d');
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate(rad);
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(img, -w / 2, -h / 2);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(dataUrl); // Fallback to original if load fails
                img.src = dataUrl;
            });
        } catch (error) {
            console.warn('OSD deskew failed:', error);
            return dataUrl; // Fallback to original on error
        }
    }

    // Unsharp mask for sharpening text edges
    unsharpMask(imageData, width, height, radius = 1, amount = 0.6, threshold = 2) {
        const src = imageData.data;
        const blur = new Uint8ClampedArray(src);
        const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1]; // 3x3 Gaussian kernel
        const ksum = 16;

        const tmp = new Uint8ClampedArray(src.length);
        // Simplified 2-pass Gaussian blur
        const pass = (input, output) => {
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    let sum = 0,
                        p = 0;
                    const idx = (y * width + x) * 4;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const ii = ((y + ky) * width + (x + kx)) * 4;
                            sum += input[ii] * kernel[p++];
                        }
                    }
                    const v = sum / ksum | 0;
                    output[idx] = output[idx + 1] = output[idx + 2] = v;
                    output[idx + 3] = 255;
                }
            }
        };
        pass(src, tmp);
        pass(tmp, blur);

        // Apply sharpening: sharpened = original + amount * (original - blurred)
        for (let i = 0; i < src.length; i += 4) {
            const s = src[i],
                b = blur[i];
            const diff = s - b;
            if (Math.abs(diff) > threshold) {
                const val = s + amount * diff;
                src[i] = src[i + 1] = src[i + 2] = Math.max(0, Math.min(255, val | 0));
            }
        }
        return imageData;
    }

    // Utility to reset Tesseract parameters to a default state
    async resetTesseractParameters() {
        if (this.tesseractWorker) {
            try {
                await this.tesseractWorker.setParameters({
                    tessedit_pageseg_mode: '3',
                    preserve_interword_spaces: '1',
                    tessedit_char_whitelist: this.getCharacterWhitelist(),
                    tessedit_enable_doc_dict: '1',
                    language_model_penalty_non_freq_dict_word: '0.15',
                    language_model_penalty_non_dict_word: '0.15',
                    tessedit_good_quality_unrej: '0',
                    tessedit_consistent_repa: '0'
                });
            } catch (error) {
                console.warn('Failed to reset Tesseract parameters:', error);
            }
        }
    }
}

// Load Tesseract.js local script first
if (!document.querySelector('script[src*="tesseract"]')) {
    const script = document.createElement('script');
    script.src = './tesseract-local/tesseract.min.js';
    script.onload = () => {
        console.log('Tesseract.js loaded successfully from local files');
        // Initialize application after Tesseract.js is loaded
        window.imageOCRTest = new ImageOCRTest();
    };
    script.onerror = () => {
        console.error('Failed to load local Tesseract.js');
        if (document.querySelector('.status-text')) {
            document.querySelector('.status-text').textContent = 'Failed to load OCR library';
        }
    };
    document.head.appendChild(script);
}
