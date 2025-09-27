// Webcam OCR Application using Tesseract.js
class WebcamOCR {
    constructor() {
        this.video = document.getElementById('cameraFeed');
        this.canvas = document.getElementById('captureCanvas');
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.querySelector('.status-text');
        this.statusDot = document.querySelector('.status-dot');
        this.resultsList = document.getElementById('resultsList');
        this.processingIndicator = document.getElementById('processingIndicator');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.querySelector('.error-text');

        this.stream = null;
        this.isProcessing = false;
        this.recognitionHistory = [];
        this.isAutoCapturing = false;
        this.autoCaptureInterval = null;

        this.initializeEventListeners();
        this.updateDebugInfo();
    }

    initializeEventListeners() {
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.clearBtn.addEventListener('click', () => this.clearResults());
        this.captureBtn = document.getElementById('captureBtn');
        if (this.captureBtn) {
            this.captureBtn.addEventListener('click', () => this.toggleAutoCapture());
        }

        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.stream) {
                this.stopCamera();
            }
        });
    }

    async startCamera() {
        try {
            this.setStatus('Starting camera...', 'warning');

            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            if (this.captureBtn) {
                this.captureBtn.disabled = false;
            }

            this.setStatus('Camera active', 'success');
            this.updateDebugInfo();

        } catch (error) {
            console.error('Camera access error:', error);
            this.showError('Failed to access camera. Please check permissions.');
            this.setStatus('Camera error', 'error');
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        this.video.srcObject = null;
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        if (this.captureBtn) {
            this.captureBtn.disabled = true;
        }

        // Stop auto-capture if running
        this.stopAutoCapture();

        this.setStatus('Camera stopped', 'warning');
        this.updateDebugInfo();
    }

    async captureAndRecognize() {
        if (this.isProcessing || !this.stream) {
            return;
        }

        try {
            this.isProcessing = true;
            this.showProcessing(true);
            this.setStatus('Processing...', 'warning');

            // Capture frame from video
            const context = this.canvas.getContext('2d');
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            context.drawImage(this.video, 0, 0);

            // Convert to image data URL
            const imageDataUrl = this.canvas.toDataURL('image/png');

            this.setStatus('Recognizing text...', 'warning');

            // Perform OCR using Tesseract.js
            const { data: { text, confidence } } = await Tesseract.recognize(
                imageDataUrl,
                'eng+chi_sim',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            this.setStatus(`Recognizing... ${Math.round(m.progress * 100)}%`, 'warning');
                        }
                    }
                }
            );

            // Add result to history
            const result = {
                text: text.trim(),
                confidence: Math.round(confidence),
                timestamp: new Date().toLocaleTimeString(),
                imageData: imageDataUrl
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

    toggleAutoCapture() {
        if (!this.stream) {
            this.showError('Please start the camera first');
            return;
        }

        if (this.isAutoCapturing) {
            this.stopAutoCapture();
            this.captureBtn.textContent = '🔄 Start Auto Capture';
            this.setStatus('Auto capture stopped', 'warning');
        } else {
            this.startAutoCapture(2000); // Capture every 2 seconds
            this.captureBtn.textContent = '⏹️ Stop Auto Capture';
            this.setStatus('Auto capture started', 'success');
        }

        this.isAutoCapturing = !this.isAutoCapturing;
    }

    addResultToList(result) {
        const resultItem = document.createElement('div');
        resultItem.className = 'result-item';

        const timestamp = document.createElement('div');
        timestamp.className = `result-timestamp ${this.getConfidenceClass(result.confidence)}`;
        timestamp.textContent = `${result.timestamp} - Confidence: ${result.confidence}%`;

        const resultText = document.createElement('div');
        resultText.className = 'result-text';
        resultText.textContent = result.text || 'No text detected';

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
        this.processingIndicator.style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.style.display = 'block';

        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.errorMessage.style.display = 'none';
        }, 5000);
    }

    updateDebugInfo() {
        const debugElements = {
            'debugBrowser': navigator.userAgent,
            'debugHttps': location.protocol === 'https:' ? 'Yes' : 'No',
            'debugCameraAPI': !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) ? 'Available' : 'Not Available',
            'debugStream': this.stream ? 'Active' : 'Inactive',
            'debugVideoSize': this.video.videoWidth && this.video.videoHeight ?
                `${this.video.videoWidth}x${this.video.videoHeight}` : 'Not available'
        };

        Object.entries(debugElements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });

        // Show debug info if camera is active
        const debugInfo = document.getElementById('debugInfo');
        if (debugInfo) {
            debugInfo.style.display = this.stream ? 'block' : 'none';
        }
    }

    // Auto-capture functionality (optional)
    startAutoCapture(interval = 3000) {
        if (this.autoCaptureInterval) {
            clearInterval(this.autoCaptureInterval);
        }

        this.autoCaptureInterval = setInterval(() => {
            if (this.stream && !this.isProcessing) {
                this.captureAndRecognize();
            }
        }, interval);
    }

    stopAutoCapture() {
        if (this.autoCaptureInterval) {
            clearInterval(this.autoCaptureInterval);
            this.autoCaptureInterval = null;
        }
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.webcamOCR = new WebcamOCR();
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