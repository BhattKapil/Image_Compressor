// API Configuration
const API_BASE_URL = 'https://image-compressor-2p4y.onrender.com';

// DOM Elements
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const formatSection = document.getElementById('formatSection');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const fileType = document.getElementById('fileType');
const formatButtons = document.querySelectorAll('.format-btn');
const compressBtn = document.getElementById('compressBtn');
const loader = document.getElementById('loader');
const resultsSection = document.getElementById('resultsSection');
const originalSize = document.getElementById('originalSize');
const compressedSize = document.getElementById('compressedSize');
const savedPercentage = document.getElementById('savedPercentage');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

let selectedFile = null;
let selectedFormat = 'jpeg';
let downloadUrl = '';

uploadBox.addEventListener('click', () => {
    fileInput.click();
});

uploadBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#764ba2';
    uploadBox.style.background = '#f0f2ff';
});

uploadBox.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#667eea';
    uploadBox.style.background = '#f8f9ff';
});

uploadBox.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadBox.style.borderColor = '#667eea';
    uploadBox.style.background = '#f8f9ff';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        formatButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFormat = btn.getAttribute('data-format');
    });
});

compressBtn.addEventListener('click', compressImage);

downloadBtn.addEventListener('click', () => {
    if (downloadUrl) {
        window.location.href = downloadUrl;
    }
});

resetBtn.addEventListener('click', resetApp);

function handleFileSelect(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/heif', 'image/heic', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.heif', '.heic', '.pdf'];
    
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
        showError('Please select a valid image file (JPEG, PNG, HEIF) or PDF');
        return;
    }
    
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('File size must be less than 10MB');
        return;
    }
    
    selectedFile = file;
    
    hideError();
    
    showPreview(file);
    
    const isPDF = file.type === 'application/pdf' || fileExtension === '.pdf';
    
    if (isPDF) {
        document.querySelector('.format-buttons').style.display = 'none';
        document.querySelector('.format-section h3').textContent = 'PDF Compression';
    } else {
        document.querySelector('.format-buttons').style.display = 'flex';
        document.querySelector('.format-section h3').textContent = 'Select Output Format';
    }
    
    formatSection.style.display = 'block';
}

function showPreview(file) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    
    if (file.type) {
        fileType.textContent = file.type;
    } else {
        const extensionMap = {
            '.heif': 'image/heif',
            '.heic': 'image/heic',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.pdf': 'application/pdf'
        };
        fileType.textContent = extensionMap[fileExtension] || 'Unknown';
    }
    
    const isPDF = file.type === 'application/pdf' || fileExtension === '.pdf';
    
    if (isPDF) {
        previewImage.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23dc3545" width="200" height="200" rx="10"/%3E%3Ctext x="50%25" y="50%25" font-size="80" text-anchor="middle" dy=".3em" fill="white"%3EPDF%3C/text%3E%3C/svg%3E';
        previewImage.style.objectFit = 'contain';
        previewSection.style.display = 'block';
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewSection.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

async function compressImage() {
    if (!selectedFile) {
        showError('Please select a file first');
        return;
    }
    
    hideError();
    resultsSection.style.display = 'none';
    
    loader.style.display = 'block';
    
    const compressionEnabled = document.getElementById('compressionToggle').checked;
    
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('format', selectedFormat);
    formData.append('compress', compressionEnabled);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/compress`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        loader.style.display = 'none';
        
        if (response.ok && data.success) {
            displayResults(data);
        } else {
            showError(data.error || 'Failed to process file');
        }
        
    } catch (error) {
        loader.style.display = 'none';
        showError('Network error. Please check your connection and try again.');
        console.error('Processing error:', error);
    }
}

function displayResults(data) {
    originalSize.textContent = data.originalSize;
    compressedSize.textContent = data.compressedSize;
    savedPercentage.textContent = data.compressionRatio;
    
    downloadUrl = `${API_BASE_URL}${data.downloadUrl}`;
    
    resultsSection.style.display = 'block';
    
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetApp() {
    selectedFile = null;
    selectedFormat = 'jpeg';
    downloadUrl = '';
    
    fileInput.value = '';
    
    formatSection.style.display = 'none';
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    loader.style.display = 'none';
    hideError();
    
    document.querySelector('.format-buttons').style.display = 'flex';
    document.querySelector('.format-section h3').textContent = 'Select Output Format';
    
    formatButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-format') === 'jpeg') {
            btn.classList.add('active');
        }
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'block';
    
    setTimeout(() => {
        hideError();
    }, 5000);
}

function hideError() {
    errorMessage.style.display = 'none';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

console.log('✅ Image Compressor loaded successfully!');
console.log('🔗 Connected to backend:', API_BASE_URL);