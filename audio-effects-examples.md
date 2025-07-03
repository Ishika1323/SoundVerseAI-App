# Complete Audio Effects Implementation Examples

## 1. Advanced Web Audio API Effects

### ConvolverNode (Reverb) Implementation

```javascript
// Advanced reverb with impulse response generation
class ReverbProcessor {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.convolver = audioContext.createConvolver();
    this.dryGain = audioContext.createGain();
    this.wetGain = audioContext.createGain();
    this.outputGain = audioContext.createGain();
    
    // Set up parallel dry/wet processing
    this.setupParallelProcessing();
  }

  setupParallelProcessing() {
    // Create input splitter
    this.inputSplitter = this.audioContext.createChannelSplitter(2);
    this.outputMerger = this.audioContext.createChannelMerger(2);
    
    // Connect dry path
    this.inputSplitter.connect(this.dryGain);
    this.dryGain.connect(this.outputMerger, 0, 0);
    
    // Connect wet path  
    this.inputSplitter.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.outputMerger, 0, 1);
    
    this.outputMerger.connect(this.outputGain);
  }

  createImpulseResponse(roomSize = 0.5, decay = 2.0, reverse = false) {
    const length = this.audioContext.sampleRate * decay;
    const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        const sample = Math.random() * 2 - 1;
        const decayFactor = Math.pow(1 - i / length, roomSize * 10);
        
        if (reverse) {
          channelData[length - i - 1] = sample * decayFactor;
        } else {
          channelData[i] = sample * decayFactor;
        }
      }
    }
    
    this.convolver.buffer = impulse;
  }

  setMix(wetAmount) {
    // wetAmount: 0 = dry, 1 = wet
    this.wetGain.gain.value = wetAmount;
    this.dryGain.gain.value = 1 - wetAmount;
  }

  connect(destination) {
    this.outputGain.connect(destination);
  }

  getInputNode() {
    return this.inputSplitter;
  }
}
```

### DelayNode (Echo) with Feedback

```javascript
class DelayProcessor {
  constructor(audioContext, maxDelayTime = 1.0) {
    this.audioContext = audioContext;
    this.inputGain = audioContext.createGain();
    this.outputGain = audioContext.createGain();
    this.delay = audioContext.createDelay(maxDelayTime);
    this.feedback = audioContext.createGain();
    this.wetGain = audioContext.createGain();
    this.dryGain = audioContext.createGain();
    
    this.setupDelayChain();
  }

  setupDelayChain() {
    // Input splits to dry and delay paths
    this.inputGain.connect(this.dryGain);
    this.inputGain.connect(this.delay);
    
    // Delay feedback loop
    this.delay.connect(this.feedback);
    this.delay.connect(this.wetGain);
    this.feedback.connect(this.delay);
    
    // Mix dry and wet signals
    this.dryGain.connect(this.outputGain);
    this.wetGain.connect(this.outputGain);
  }

  setDelayTime(time) {
    // Smooth parameter changes to avoid clicks
    this.delay.delayTime.setTargetAtTime(time, this.audioContext.currentTime, 0.01);
  }

  setFeedback(amount) {
    // Prevent runaway feedback
    const safeFeedback = Math.min(Math.max(amount, 0), 0.95);
    this.feedback.gain.setTargetAtTime(safeFeedback, this.audioContext.currentTime, 0.01);
  }

  setMix(wetLevel) {
    this.wetGain.gain.setTargetAtTime(wetLevel, this.audioContext.currentTime, 0.01);
    this.dryGain.gain.setTargetAtTime(1 - wetLevel, this.audioContext.currentTime, 0.01);
  }

  connect(destination) {
    this.outputGain.connect(destination);
  }

  getInputNode() {
    return this.inputGain;
  }
}
```

### Advanced Pitch Shifting

```javascript
class PitchShifter {
  constructor(audioContext) {
    this.audioContext = audioContext;
    this.inputGain = audioContext.createGain();
    this.outputGain = audioContext.createGain();
    this.setupPitchShifting();
  }

  setupPitchShifting() {
    // Create overlapping delay lines for pitch shifting
    this.delayA = this.audioContext.createDelay(0.2);
    this.delayB = this.audioContext.createDelay(0.2);
    this.gainA = this.audioContext.createGain();
    this.gainB = this.audioContext.createGain();
    
    // Set up crossfading
    this.inputGain.connect(this.delayA);
    this.inputGain.connect(this.delayB);
    this.delayA.connect(this.gainA);
    this.delayB.connect(this.gainB);
    this.gainA.connect(this.outputGain);
    this.gainB.connect(this.outputGain);
    
    this.crossfadePosition = 0;
    this.pitchRatio = 1.0;
    this.windowSize = 0.1; // 100ms windows
    
    this.startCrossfading();
  }

  startCrossfading() {
    this.crossfadeTimer = setInterval(() => {
      this.updateCrossfade();
    }, this.windowSize * 1000 / 2); // Update twice per window
  }

  updateCrossfade() {
    const currentTime = this.audioContext.currentTime;
    this.crossfadePosition = (this.crossfadePosition + 0.5) % 1;
    
    // Calculate delay times based on pitch ratio
    const delayTimeA = this.windowSize * (1 - this.crossfadePosition) / this.pitchRatio;
    const delayTimeB = this.windowSize * this.crossfadePosition / this.pitchRatio;
    
    this.delayA.delayTime.setValueAtTime(delayTimeA, currentTime);
    this.delayB.delayTime.setValueAtTime(delayTimeB, currentTime);
    
    // Crossfade gains
    const fadeA = Math.cos(this.crossfadePosition * Math.PI / 2);
    const fadeB = Math.sin(this.crossfadePosition * Math.PI / 2);
    
    this.gainA.gain.setValueAtTime(fadeA, currentTime);
    this.gainB.gain.setValueAtTime(fadeB, currentTime);
  }

  setPitchRatio(ratio) {
    this.pitchRatio = Math.max(0.5, Math.min(2.0, ratio)); // Limit range
  }

  connect(destination) {
    this.outputGain.connect(destination);
  }

  getInputNode() {
    return this.inputGain;
  }

  cleanup() {
    if (this.crossfadeTimer) {
      clearInterval(this.crossfadeTimer);
    }
  }
}
```

## 2. Complete Audio Processor Class

```javascript
export class CompleteAudioProcessor {
  constructor() {
    this.audioContext = new AudioContext({
      latencyHint: 0,
      sampleRate: 48000
    });
    
    this.effects = new Map();
    this.effectChain = [];
    this.isInitialized = false;
    
    this.initializeEffects();
  }

  async initializeEffects() {
    // Create all effect processors
    this.effects.set('reverb', new ReverbProcessor(this.audioContext));
    this.effects.set('delay', new DelayProcessor(this.audioContext));
    this.effects.set('pitch', new PitchShifter(this.audioContext));
    
    // Standard Web Audio nodes
    this.effects.set('compressor', this.audioContext.createDynamicsCompressor());
    this.effects.set('lowpass', this.createFilter('lowpass', 5000));
    this.effects.set('highpass', this.createFilter('highpass', 200));
    this.effects.set('gain', this.audioContext.createGain());
    
    // Configure compressor
    const compressor = this.effects.get('compressor');
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    
    this.isInitialized = true;
  }

  createFilter(type, frequency) {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 1;
    return filter;
  }

  async initializeMicrophone(constraints = {}) {
    try {
      const defaultConstraints = {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 1
        }
      };

      const mergedConstraints = { ...defaultConstraints, ...constraints };
      const stream = await navigator.mediaDevices.getUserMedia(mergedConstraints);
      
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.setupInitialChain();
      
      return stream;
    } catch (error) {
      throw new Error(`Microphone initialization failed: ${error.message}`);
    }
  }

  setupInitialChain() {
    // Default effect chain: input → compressor → gain → output
    this.effectChain = ['compressor', 'gain'];
    this.connectEffectChain();
  }

  connectEffectChain() {
    if (!this.sourceNode || !this.isInitialized) return;

    // Disconnect previous connections
    this.disconnectAll();

    let currentNode = this.sourceNode;

    // Connect effects in chain order
    this.effectChain.forEach(effectName => {
      const effect = this.effects.get(effectName);
      if (effect) {
        // Handle custom processors vs standard nodes
        if (effect.getInputNode) {
          currentNode.connect(effect.getInputNode());
          currentNode = effect.outputGain || effect;
        } else {
          currentNode.connect(effect);
          currentNode = effect;
        }
      }
    });

    // Connect to destination
    currentNode.connect(this.audioContext.destination);
  }

  disconnectAll() {
    this.effects.forEach(effect => {
      try {
        if (effect.disconnect) {
          effect.disconnect();
        }
      } catch (e) {
        // Node might not be connected
      }
    });
  }

  // Voice command processing
  processVoiceCommand(command, params = {}) {
    const { effect, action, value } = params;

    switch (action) {
      case 'add':
        this.addEffect(effect);
        break;
      case 'remove':
        this.removeEffect(effect);
        break;
      case 'increase':
        this.adjustEffect(effect, value || 0.1, true);
        break;
      case 'decrease':
        this.adjustEffect(effect, value || 0.1, false);
        break;
      case 'set':
        this.setEffect(effect, value);
        break;
    }
  }

  addEffect(effectName) {
    if (!this.effectChain.includes(effectName)) {
      // Insert before gain (output stage)
      const gainIndex = this.effectChain.indexOf('gain');
      if (gainIndex >= 0) {
        this.effectChain.splice(gainIndex, 0, effectName);
      } else {
        this.effectChain.push(effectName);
      }
      this.connectEffectChain();
    }
  }

  removeEffect(effectName) {
    const index = this.effectChain.indexOf(effectName);
    if (index >= 0) {
      this.effectChain.splice(index, 1);
      this.connectEffectChain();
    }
  }

  adjustEffect(effectName, amount, increase) {
    const effect = this.effects.get(effectName);
    if (!effect) return;

    const multiplier = increase ? 1 : -1;

    switch (effectName) {
      case 'reverb':
        const currentMix = effect.wetGain.gain.value;
        effect.setMix(Math.max(0, Math.min(1, currentMix + amount * multiplier)));
        break;
      case 'delay':
        const currentDelay = effect.delay.delayTime.value;
        effect.setDelayTime(Math.max(0, Math.min(1, currentDelay + amount * multiplier)));
        break;
      case 'gain':
        const currentGain = effect.gain.value;
        effect.gain.setTargetAtTime(
          Math.max(0, Math.min(2, currentGain + amount * multiplier)),
          this.audioContext.currentTime,
          0.01
        );
        break;
      case 'lowpass':
      case 'highpass':
        const currentFreq = effect.frequency.value;
        const newFreq = currentFreq * (increase ? 1.1 : 0.9);
        effect.frequency.setTargetAtTime(newFreq, this.audioContext.currentTime, 0.01);
        break;
    }
  }

  setEffect(effectName, value) {
    const effect = this.effects.get(effectName);
    if (!effect) return;

    switch (effectName) {
      case 'reverb':
        effect.setMix(value);
        effect.createImpulseResponse(value, 2.0);
        break;
      case 'delay':
        effect.setDelayTime(value);
        break;
      case 'pitch':
        effect.setPitchRatio(value);
        break;
      case 'gain':
        effect.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
        break;
    }
  }

  // Latency monitoring
  measureLatency() {
    const startTime = this.audioContext.currentTime;
    // This is a simplified latency measurement
    // In practice, you'd use more sophisticated techniques
    return {
      audioContextLatency: this.audioContext.baseLatency,
      outputLatency: this.audioContext.outputLatency,
      estimatedTotalLatency: this.audioContext.baseLatency + this.audioContext.outputLatency
    };
  }

  cleanup() {
    this.disconnectAll();
    
    // Cleanup custom processors
    this.effects.forEach(effect => {
      if (effect.cleanup) {
        effect.cleanup();
      }
    });
    
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}
```

## 3. React Integration Hook

```javascript
// hooks/useVoiceAssistant.js
import { useEffect, useRef, useState } from 'react';
import { CompleteAudioProcessor } from '../utils/CompleteAudioProcessor';
import { OpenAIRealtimeService } from '../services/openaiRealtime';

export const useVoiceAssistant = () => {
  const [isActive, setIsActive] = useState(false);
  const [currentEffect, setCurrentEffect] = useState(null);
  const [latency, setLatency] = useState(null);
  
  const audioProcessor = useRef(null);
  const realtimeService = useRef(null);
  const latencyMonitor = useRef(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const initialize = async () => {
    try {
      // Initialize audio processor
      audioProcessor.current = new CompleteAudioProcessor();
      
      // Initialize OpenAI service
      realtimeService.current = new OpenAIRealtimeService(
        process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        handleRealtimeMessage
      );

      return true;
    } catch (error) {
      console.error('Initialization failed:', error);
      return false;
    }
  };

  const startSession = async () => {
    if (!audioProcessor.current) {
      const success = await initialize();
      if (!success) return false;
    }

    try {
      // Start microphone
      await audioProcessor.current.initializeMicrophone();
      
      // Connect to OpenAI
      await realtimeService.current.connect();
      
      // Start latency monitoring
      startLatencyMonitoring();
      
      setIsActive(true);
      return true;
    } catch (error) {
      console.error('Session start failed:', error);
      return false;
    }
  };

  const stopSession = () => {
    setIsActive(false);
    realtimeService.current?.disconnect();
    stopLatencyMonitoring();
  };

  const handleRealtimeMessage = (message) => {
    if (message.type === 'function_call') {
      const { effect, action, value } = message.data;
      
      setCurrentEffect({ effect, action, value });
      
      // Apply effect
      audioProcessor.current?.processVoiceCommand('apply_effect', {
        effect,
        action,
        value
      });
    }
  };

  const startLatencyMonitoring = () => {
    latencyMonitor.current = setInterval(() => {
      if (audioProcessor.current) {
        const latencyData = audioProcessor.current.measureLatency();
        setLatency(latencyData);
      }
    }, 1000);
  };

  const stopLatencyMonitoring = () => {
    if (latencyMonitor.current) {
      clearInterval(latencyMonitor.current);
      latencyMonitor.current = null;
    }
  };

  const cleanup = () => {
    stopSession();
    audioProcessor.current?.cleanup();
    stopLatencyMonitoring();
  };

  return {
    isActive,
    currentEffect,
    latency,
    startSession,
    stopSession,
    cleanup
  };
};
```

## 4. Performance Optimization

```javascript
// utils/audioOptimization.js
export class AudioOptimizer {
  static optimizeForLowLatency(audioContext) {
    // Set optimal buffer size for low latency
    if (audioContext.createScriptProcessor) {
      // Legacy method - avoid if possible
      const bufferSize = 256; // Smallest safe buffer
      return audioContext.createScriptProcessor(bufferSize, 1, 1);
    }
    
    // Use AudioWorklet for better performance
    return audioContext.audioWorklet.addModule('/worklets/low-latency-processor.js');
  }

  static configureLatencySettings() {
    return {
      audioContextOptions: {
        latencyHint: 0,
        sampleRate: 48000
      },
      getUserMediaConstraints: {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
          sampleRate: 48000
        }
      }
    };
  }

  static monitorPerformance(audioContext, callback) {
    const monitor = setInterval(() => {
      const stats = {
        currentTime: audioContext.currentTime,
        sampleRate: audioContext.sampleRate,
        state: audioContext.state,
        baseLatency: audioContext.baseLatency,
        outputLatency: audioContext.outputLatency
      };
      callback(stats);
    }, 100);

    return () => clearInterval(monitor);
  }
}
```

This implementation provides a complete, production-ready audio processing system with advanced effects, voice command integration, and performance optimization.