// Application data from JSON
const effectTypes = [
    {
        "name": "Reverb",
        "type": "ConvolverNode",
        "parameters": {
            "roomSize": 0.5,
            "decay": 2.0,
            "wetness": 0.3
        },
        "description": "Adds spatial depth and ambience"
    },
    {
        "name": "Delay",
        "type": "DelayNode",
        "parameters": {
            "time": 0.3,
            "feedback": 0.4,
            "mix": 0.25
        },
        "description": "Creates echo effects"
    },
    {
        "name": "Low-Pass Filter",
        "type": "BiquadFilterNode",
        "parameters": {
            "frequency": 5000,
            "Q": 1.0,
            "gain": 0
        },
        "description": "Removes high frequencies"
    },
    {
        "name": "High-Pass Filter",
        "type": "BiquadFilterNode",
        "parameters": {
            "frequency": 200,
            "Q": 1.0,
            "gain": 0
        },
        "description": "Removes low frequencies"
    },
    {
        "name": "Compressor",
        "type": "DynamicsCompressorNode",
        "parameters": {
            "threshold": -24,
            "ratio": 12,
            "attack": 0.003,
            "release": 0.25
        },
        "description": "Controls dynamic range"
    },
    {
        "name": "Gain",
        "type": "GainNode",
        "parameters": {
            "gain": 1.0
        },
        "description": "Adjusts volume level"
    }
];

const voiceCommands = [
    "Add reverb",
    "Increase delay time",
    "Apply low-pass filter",
    "Reduce reverb by 50%",
    "Add compression",
    "Pitch shift up 3 semitones",
    "Remove echo",
    "Boost volume"
];

// Application state
let isRecording = false;
let audioContext = null;
let currentAudioFile = null;
let visualizationType = 'waveform';
let effectsEnabled = true;
let activeEffects = {};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    setupAudioVisualization();
    startSystemMonitoring();
});

function initializeApp() {
    // Initialize Web Audio API
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('Web Audio API initialized');
    } catch (error) {
        console.warn('Web Audio API not supported:', error);
    }

    // Populate effects grid
    populateEffectsGrid();
    
    // Populate voice commands
    populateVoiceCommands();
    
    // Initialize all effects as inactive
    effectTypes.forEach(effect => {
        activeEffects[effect.name] = { enabled: false, parameters: { ...effect.parameters } };
    });
}

function setupEventListeners() {
    // Talk button
    const talkButton = document.getElementById('talkButton');
    talkButton.addEventListener('click', toggleVoiceRecording);

    // File upload
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('audioFileInput');
    const removeFileBtn = document.getElementById('removeFile');

    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', handleDragOver);
    uploadZone.addEventListener('drop', handleFileDrop);
    fileInput.addEventListener('change', handleFileUpload);
    removeFileBtn.addEventListener('click', removeCurrentFile);

    // Effects toggle
    const effectsToggle = document.getElementById('effectsEnabled');
    effectsToggle.addEventListener('change', toggleEffects);

    // Visualization controls
    const vizToggles = document.querySelectorAll('.visualization-toggle');
    vizToggles.forEach(toggle => {
        toggle.addEventListener('click', () => {
            vizToggles.forEach(t => t.classList.remove('active'));
            toggle.classList.add('active');
            visualizationType = toggle.dataset.viz;
        });
    });

    // Technical details toggle
    const technicalToggle = document.getElementById('toggleTechnical');
    const technicalContent = document.getElementById('technicalContent');
    technicalToggle.addEventListener('click', () => {
        const isVisible = technicalContent.style.display !== 'none';
        technicalContent.style.display = isVisible ? 'none' : 'block';
        technicalToggle.textContent = isVisible ? 'Show Details' : 'Hide Details';
    });
}

function populateEffectsGrid() {
    const effectsGrid = document.getElementById('effectsGrid');
    
    effectTypes.forEach(effect => {
        const effectControl = createEffectControl(effect);
        effectsGrid.appendChild(effectControl);
    });
}

function createEffectControl(effect) {
    const effectDiv = document.createElement('div');
    effectDiv.className = 'effect-control';
    effectDiv.dataset.effectName = effect.name;

    const parametersHtml = Object.entries(effect.parameters).map(([key, value]) => {
        const min = getParameterMin(key);
        const max = getParameterMax(key);
        const step = getParameterStep(key);
        
        return `
            <div class="param-control">
                <div class="param-label">
                    <span>${formatParameterName(key)}</span>
                    <span class="param-value">${formatParameterValue(key, value)}</span>
                </div>
                <input type="range" class="param-slider" 
                       data-param="${key}" 
                       min="${min}" 
                       max="${max}" 
                       step="${step}" 
                       value="${value}">
            </div>
        `;
    }).join('');

    effectDiv.innerHTML = `
        <div class="effect-header">
            <span class="effect-name">${effect.name}</span>
            <label class="toggle-switch effect-toggle">
                <input type="checkbox" class="effect-enabled">
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="effect-params">
            ${parametersHtml}
        </div>
    `;

    // Add event listeners
    const toggle = effectDiv.querySelector('.effect-enabled');
    const sliders = effectDiv.querySelectorAll('.param-slider');

    toggle.addEventListener('change', () => toggleEffect(effect.name, toggle.checked));
    
    sliders.forEach(slider => {
        slider.addEventListener('input', () => {
            const paramName = slider.dataset.param;
            const value = parseFloat(slider.value);
            updateEffectParameter(effect.name, paramName, value);
            
            // Update display value
            const valueSpan = slider.parentElement.querySelector('.param-value');
            valueSpan.textContent = formatParameterValue(paramName, value);
        });
    });

    return effectDiv;
}

function getParameterMin(param) {
    const mins = {
        roomSize: 0, decay: 0.1, wetness: 0,
        time: 0, feedback: 0, mix: 0,
        frequency: 20, Q: 0.1, gain: -40,
        threshold: -60, ratio: 1, attack: 0.001, release: 0.01
    };
    return mins[param] || 0;
}

function getParameterMax(param) {
    const maxs = {
        roomSize: 1, decay: 10, wetness: 1,
        time: 1, feedback: 0.95, mix: 1,
        frequency: 20000, Q: 30, gain: 40,
        threshold: 0, ratio: 20, attack: 1, release: 1
    };
    return maxs[param] || 1;
}

function getParameterStep(param) {
    const steps = {
        frequency: 10, threshold: 1, ratio: 0.1, attack: 0.001, release: 0.01
    };
    return steps[param] || 0.01;
}

function formatParameterName(param) {
    const names = {
        roomSize: 'Room Size',
        wetness: 'Wet/Dry',
        time: 'Time',
        feedback: 'Feedback',
        mix: 'Mix',
        frequency: 'Frequency',
        Q: 'Q Factor',
        gain: 'Gain',
        threshold: 'Threshold',
        ratio: 'Ratio',
        attack: 'Attack',
        release: 'Release'
    };
    return names[param] || param;
}

function formatParameterValue(param, value) {
    if (param === 'frequency') return `${Math.round(value)} Hz`;
    if (param === 'time') return `${(value * 1000).toFixed(0)} ms`;
    if (param === 'gain' || param === 'threshold') return `${value.toFixed(1)} dB`;
    if (param === 'attack' || param === 'release') return `${(value * 1000).toFixed(0)} ms`;
    if (param === 'ratio') return `${value.toFixed(1)}:1`;
    return value.toFixed(2);
}

function populateVoiceCommands() {
    const commandsList = document.getElementById('commandsList');
    
    voiceCommands.forEach(command => {
        const button = document.createElement('button');
        button.className = 'command-button';
        button.textContent = command;
        button.addEventListener('click', () => simulateVoiceCommand(command));
        commandsList.appendChild(button);
    });
}

function toggleVoiceRecording() {
    const talkButton = document.getElementById('talkButton');
    const voiceStatus = document.getElementById('voiceStatus');
    const talkText = talkButton.querySelector('.talk-text');

    isRecording = !isRecording;

    if (isRecording) {
        talkButton.classList.add('active');
        talkText.textContent = 'Listening...';
        voiceStatus.innerHTML = '<p>🎤 Listening for voice commands...</p>';
        
        // Simulate voice command recognition after random delay
        setTimeout(() => {
            if (isRecording) {
                const randomCommand = voiceCommands[Math.floor(Math.random() * voiceCommands.length)];
                simulateVoiceCommand(randomCommand);
                toggleVoiceRecording(); // Stop recording
            }
        }, 2000 + Math.random() * 3000);
    } else {
        talkButton.classList.remove('active');
        talkText.textContent = 'Click to Talk';
        voiceStatus.innerHTML = '<p>Ready to listen for voice commands</p>';
    }
}

function simulateVoiceCommand(command) {
    console.log('Voice command recognized:', command);
    
    // Add to command history
    addToCommandHistory(command);
    
    // Process the command
    processVoiceCommand(command);
    
    // Show visual feedback
    showCommandFeedback(command);
}

function processVoiceCommand(command) {
    const lowerCommand = command.toLowerCase();
    
    if (lowerCommand.includes('reverb')) {
        if (lowerCommand.includes('add') || lowerCommand.includes('apply')) {
            toggleEffect('Reverb', true);
        } else if (lowerCommand.includes('reduce') || lowerCommand.includes('remove')) {
            if (lowerCommand.includes('50%')) {
                updateEffectParameter('Reverb', 'wetness', 0.15);
            } else {
                toggleEffect('Reverb', false);
            }
        }
    }
    
    if (lowerCommand.includes('delay') || lowerCommand.includes('echo')) {
        if (lowerCommand.includes('increase') || lowerCommand.includes('add')) {
            toggleEffect('Delay', true);
            if (lowerCommand.includes('time')) {
                updateEffectParameter('Delay', 'time', 0.6);
            }
        } else if (lowerCommand.includes('remove')) {
            toggleEffect('Delay', false);
        }
    }
    
    if (lowerCommand.includes('filter')) {
        if (lowerCommand.includes('low-pass') || lowerCommand.includes('lowpass')) {
            toggleEffect('Low-Pass Filter', true);
        } else if (lowerCommand.includes('high-pass') || lowerCommand.includes('highpass')) {
            toggleEffect('High-Pass Filter', true);
        }
    }
    
    if (lowerCommand.includes('compression') || lowerCommand.includes('compressor')) {
        toggleEffect('Compressor', true);
    }
    
    if (lowerCommand.includes('volume') || lowerCommand.includes('gain')) {
        toggleEffect('Gain', true);
        if (lowerCommand.includes('boost')) {
            updateEffectParameter('Gain', 'gain', 1.5);
        }
    }
}

function addToCommandHistory(command) {
    const commandHistory = document.getElementById('commandHistory');
    const commandItem = document.createElement('div');
    commandItem.className = 'command-item';
    
    const now = new Date();
    const timeString = 'just now';
    
    commandItem.innerHTML = `
        <span class="command-text">"${command}"</span>
        <span class="command-time">${timeString}</span>
    `;
    
    commandHistory.insertBefore(commandItem, commandHistory.firstChild);
    
    // Keep only last 10 commands
    while (commandHistory.children.length > 10) {
        commandHistory.removeChild(commandHistory.lastChild);
    }
}

function showCommandFeedback(command) {
    const voiceStatus = document.getElementById('voiceStatus');
    voiceStatus.innerHTML = `<p>✅ Command processed: "${command}"</p>`;
    
    setTimeout(() => {
        voiceStatus.innerHTML = '<p>Ready to listen for voice commands</p>';
    }, 3000);
}

function toggleEffect(effectName, enabled) {
    activeEffects[effectName].enabled = enabled;
    
    // Update UI
    const effectControl = document.querySelector(`[data-effect-name="${effectName}"]`);
    const toggle = effectControl.querySelector('.effect-enabled');
    const effectDiv = effectControl;
    
    toggle.checked = enabled;
    
    if (enabled) {
        effectDiv.classList.add('active');
    } else {
        effectDiv.classList.remove('active');
    }
    
    console.log(`Effect ${effectName} ${enabled ? 'enabled' : 'disabled'}`);
}

function updateEffectParameter(effectName, paramName, value) {
    if (activeEffects[effectName]) {
        activeEffects[effectName].parameters[paramName] = value;
        
        // Update slider in UI
        const effectControl = document.querySelector(`[data-effect-name="${effectName}"]`);
        const slider = effectControl.querySelector(`[data-param="${paramName}"]`);
        if (slider) {
            slider.value = value;
            
            // Update display value
            const valueSpan = slider.parentElement.querySelector('.param-value');
            valueSpan.textContent = formatParameterValue(paramName, value);
        }
        
        console.log(`Updated ${effectName} ${paramName} to ${value}`);
    }
}

function toggleEffects(event) {
    effectsEnabled = event.target.checked;
    const effectsGrid = document.getElementById('effectsGrid');
    
    if (effectsEnabled) {
        effectsGrid.style.opacity = '1';
        effectsGrid.style.pointerEvents = 'auto';
    } else {
        effectsGrid.style.opacity = '0.5';
        effectsGrid.style.pointerEvents = 'none';
    }
}

// File handling
function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('dragover');
}

function handleFileDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        handleFile(file);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('audio/')) {
        alert('Please select an audio file');
        return;
    }
    
    currentAudioFile = file;
    
    // Update UI
    const uploadZone = document.getElementById('uploadZone');
    const currentFileDiv = document.getElementById('currentFile');
    const fileName = currentFileDiv.querySelector('.file-name');
    
    uploadZone.style.display = 'none';
    currentFileDiv.style.display = 'flex';
    fileName.textContent = file.name;
    
    console.log('Audio file loaded:', file.name);
}

function removeCurrentFile() {
    currentAudioFile = null;
    
    const uploadZone = document.getElementById('uploadZone');
    const currentFileDiv = document.getElementById('currentFile');
    
    uploadZone.style.display = 'block';
    currentFileDiv.style.display = 'none';
}

// Audio visualization
function setupAudioVisualization() {
    const canvas = document.getElementById('audioCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    function drawVisualization() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (visualizationType === 'waveform') {
            drawWaveform(ctx);
        } else {
            drawSpectrum(ctx);
        }
        
        requestAnimationFrame(drawVisualization);
    }
    
    drawVisualization();
}

function drawWaveform(ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#21808d');
    gradient.addColorStop(1, '#32b8c6');
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    const centerY = height / 2;
    const time = Date.now() * 0.001;
    
    for (let x = 0; x < width; x++) {
        const frequency = 0.02;
        const amplitude = 30;
        const y = centerY + Math.sin((x * frequency) + time) * amplitude * Math.sin(time * 0.5);
        
        if (x === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
}

function drawSpectrum(ctx) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const barCount = 64;
    const barWidth = width / barCount;
    
    const gradient = ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0, '#21808d');
    gradient.addColorStop(0.5, '#32b8c6');
    gradient.addColorStop(1, '#4dd0e1');
    
    ctx.fillStyle = gradient;
    
    const time = Date.now() * 0.001;
    
    for (let i = 0; i < barCount; i++) {
        const barHeight = (Math.sin(time + i * 0.1) * 0.5 + 0.5) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        
        ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
}

// System monitoring
function startSystemMonitoring() {
    setInterval(updateSystemMetrics, 1000);
}

function updateSystemMetrics() {
    // Update latency
    const latencyValue = 200 + Math.random() * 100;
    const latencyElement = document.getElementById('latencyValue');
    const latencyStatus = latencyElement.parentElement.querySelector('.metric-status');
    
    latencyElement.querySelector('.value').textContent = Math.round(latencyValue);
    
    if (latencyValue < 150) {
        latencyStatus.className = 'metric-status status--success';
        latencyStatus.textContent = 'Excellent';
    } else if (latencyValue < 300) {
        latencyStatus.className = 'metric-status status--info';
        latencyStatus.textContent = 'Good';
    } else if (latencyValue < 800) {
        latencyStatus.className = 'metric-status status--warning';
        latencyStatus.textContent = 'Acceptable';
    } else {
        latencyStatus.className = 'metric-status status--error';
        latencyStatus.textContent = 'Poor';
    }
    
    // Update audio level
    const audioLevel = -20 + Math.random() * 15;
    document.getElementById('audioLevel').textContent = Math.round(audioLevel);
    
    const audioMeter = document.getElementById('audioMeter');
    const meterWidth = Math.max(0, Math.min(100, (audioLevel + 60) / 60 * 100));
    audioMeter.style.width = meterWidth + '%';
    
    // Update CPU usage
    const cpuUsage = 20 + Math.random() * 30;
    document.getElementById('cpuUsage').textContent = Math.round(cpuUsage);
    document.getElementById('cpuMeter').style.width = cpuUsage + '%';
}

// Window resize handler for canvas
window.addEventListener('resize', () => {
    const canvas = document.getElementById('audioCanvas');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
});

// Initialize audio context on user interaction
document.addEventListener('click', function initAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });