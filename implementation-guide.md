# Soundverse Duplex Voice Assistant - Implementation Guide

## Project Overview

This guide will help you build a web-based duplex voice assistant that performs real-time audio manipulations using Web Audio API, OpenAI Realtime API, and modern web technologies.

##  Architecture Overview

### Core Components
1. **Frontend**: Next.js with Redux for state management
2. **Backend**: FastAPI for WebSocket handling + Node.js for Socket.IO
3. **Audio Processing**: Web Audio API for real-time effects
4. **AI Services**: OpenAI Realtime API for speech-to-speech
5. **Communication**: WebSocket/Socket.IO for bidirectional audio streaming

### Latency Target: ≤800ms round-trip

## Prerequisites

- Node.js 18+ and npm
- Python 3.8+ for FastAPI backend
- OpenAI API key with Realtime API access
- Basic understanding of JavaScript, React, and audio concepts

##  Step 1: Project Setup

### Create Next.js Frontend

```bash
npx create-next-app@latest soundverse-assistant --typescript --tailwind --eslint
cd soundverse-assistant
npm install @reduxjs/toolkit react-redux socket.io-client
```

### Backend Setup

```bash
mkdir backend
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install fastapi uvicorn websockets python-socketio aiohttp openai
```

##  Step 2: Web Audio API Setup

### Audio Context and Effects Chain

```typescript
// utils/audioProcessor.ts
export class AudioProcessor {
  private audioContext: AudioContext;
  private source: MediaStreamAudioSourceNode | null = null;
  private effects: Map<string, AudioNode> = new Map();
  private outputGain: GainNode;

  constructor() {
    this.audioContext = new AudioContext({
      latencyHint: 0, // Minimize latency
      sampleRate: 48000
    });
    this.outputGain = this.audioContext.createGain();
    this.outputGain.connect(this.audioContext.destination);
    this.setupEffectChain();
  }

  private setupEffectChain() {
    // Reverb (ConvolverNode)
    const convolver = this.audioContext.createConvolver();
    this.effects.set('reverb', convolver);

    // Delay/Echo (DelayNode)
    const delay = this.audioContext.createDelay(1.0);
    delay.delayTime.value = 0.3;
    this.effects.set('delay', delay);

    // Low-pass filter (BiquadFilterNode)
    const lowpass = this.audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 5000;
    this.effects.set('lowpass', lowpass);

    // High-pass filter
    const highpass = this.audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 200;
    this.effects.set('highpass', highpass);

    // Dynamics Compressor
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    this.effects.set('compressor', compressor);

    // Pitch shift (using playback rate)
    // Note: For advanced pitch shifting, consider using a library like Tone.js
  }

  async initializeMicrophone(): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0
        }
      });

      this.source = this.audioContext.createMediaStreamSource(stream);
      return stream;
    } catch (error) {
      throw new Error(`Failed to access microphone: ${error}`);
    }
  }

  applyEffect(effectName: string, params: any) {
    const effect = this.effects.get(effectName);
    if (!effect) return;

    switch (effectName) {
      case 'reverb':
        this.applyReverb(effect as ConvolverNode, params.amount);
        break;
      case 'delay':
        (effect as DelayNode).delayTime.value = params.time;
        break;
      case 'lowpass':
        (effect as BiquadFilterNode).frequency.value = params.frequency;
        break;
      case 'highpass':
        (effect as BiquadFilterNode).frequency.value = params.frequency;
        break;
    }
  }

  private async applyReverb(convolver: ConvolverNode, amount: number) {
    // Create impulse response for reverb
    const impulseResponse = this.createImpulseResponse(amount);
    convolver.buffer = impulseResponse;
  }

  private createImpulseResponse(amount: number): AudioBuffer {
    const length = this.audioContext.sampleRate * 2; // 2 seconds
    const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
    
    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, amount);
      }
    }
    
    return impulse;
  }

  connectEffectChain(effectNames: string[]) {
    if (!this.source) return;

    let currentNode: AudioNode = this.source;
    
    effectNames.forEach(effectName => {
      const effect = this.effects.get(effectName);
      if (effect) {
        currentNode.connect(effect);
        currentNode = effect;
      }
    });

    currentNode.connect(this.outputGain);
  }
}
```

##  Step 3: Redux State Management

```typescript
// store/audioSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AudioState {
  isRecording: boolean;
  isProcessing: boolean;
  currentEffect: string | null;
  effectParams: Record<string, any>;
  volume: number;
  latency: number;
}

const initialState: AudioState = {
  isRecording: false,
  isProcessing: false,
  currentEffect: null,
  effectParams: {},
  volume: 1.0,
  latency: 0
};

const audioSlice = createSlice({
  name: 'audio',
  initialState,
  reducers: {
    startRecording: (state) => {
      state.isRecording = true;
    },
    stopRecording: (state) => {
      state.isRecording = false;
    },
    setEffect: (state, action: PayloadAction<{effect: string, params: any}>) => {
      state.currentEffect = action.payload.effect;
      state.effectParams = action.payload.params;
    },
    setVolume: (state, action: PayloadAction<number>) => {
      state.volume = action.payload;
    },
    updateLatency: (state, action: PayloadAction<number>) => {
      state.latency = action.payload;
    }
  }
});

export const { startRecording, stopRecording, setEffect, setVolume, updateLatency } = audioSlice.actions;
export default audioSlice.reducer;
```

##  Step 4: OpenAI Realtime API Integration

```typescript
// services/openaiRealtime.ts
export class OpenAIRealtimeService {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private onMessage: (message: any) => void;

  constructor(apiKey: string, onMessage: (message: any) => void) {
    this.apiKey = apiKey;
    this.onMessage = onMessage;
  }

  async connect() {
    const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
    
    this.ws = new WebSocket(url, [], {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    this.ws.onopen = () => {
      console.log('Connected to OpenAI Realtime API');
      this.sendSessionConfig();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private sendSessionConfig() {
    const config = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are a helpful audio engineer assistant. Parse user voice commands to apply audio effects like reverb, delay, filters, and gain adjustments.',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200
        },
        tools: [
          {
            type: 'function',
            name: 'apply_audio_effect',
            description: 'Apply audio effects based on user commands',
            parameters: {
              type: 'object',
              properties: {
                effect: {
                  type: 'string',
                  enum: ['reverb', 'delay', 'lowpass', 'highpass', 'gain', 'compress']
                },
                action: {
                  type: 'string',
                  enum: ['add', 'remove', 'increase', 'decrease', 'set']
                },
                value: {
                  type: 'number',
                  description: 'Effect parameter value'
                }
              }
            }
          }
        ]
      }
    };

    this.ws?.send(JSON.stringify(config));
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'session.created':
        console.log('Session created');
        break;
      case 'input_audio_buffer.speech_started':
        console.log('Speech detected');
        break;
      case 'response.audio.delta':
        // Handle audio response
        this.onMessage({
          type: 'audio_response',
          data: message.delta
        });
        break;
      case 'response.function_call_arguments.done':
        // Handle function call
        this.onMessage({
          type: 'function_call',
          data: JSON.parse(message.arguments)
        });
        break;
    }
  }

  sendAudio(audioData: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'input_audio_buffer.append',
        audio: btoa(String.fromCharCode(...new Uint8Array(audioData)))
      };
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    this.ws?.close();
  }
}
```

##  Step 5: FastAPI Backend

```python
# backend/main.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import base64
from typing import Dict, List
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.audio_sessions: Dict[str, dict] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.audio_sessions[session_id] = {
            'websocket': websocket,
            'effects_chain': [],
            'is_processing': False
        }

    def disconnect(self, websocket: WebSocket, session_id: str):
        self.active_connections.remove(websocket)
        if session_id in self.audio_sessions:
            del self.audio_sessions[session_id]

    async def send_personal_message(self, message: dict, session_id: str):
        if session_id in self.audio_sessions:
            websocket = self.audio_sessions[session_id]['websocket']
            await websocket.send_text(json.dumps(message))

manager = ConnectionManager()

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            if message['type'] == 'audio_data':
                # Process audio data
                await process_audio_command(message, session_id)
            elif message['type'] == 'effect_command':
                # Apply effect
                await apply_effect(message, session_id)
            elif message['type'] == 'stop_session':
                # Clean up session
                await cleanup_session(session_id)
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, session_id)

async def process_audio_command(message: dict, session_id: str):
    # Parse audio command and route to appropriate handler
    command = message.get('command', '')
    params = message.get('params', {})
    
    # Send response back to client
    response = {
        'type': 'command_processed',
        'effect': command,
        'params': params,
        'timestamp': asyncio.get_event_loop().time()
    }
    
    await manager.send_personal_message(response, session_id)

async def apply_effect(message: dict, session_id: str):
    effect_name = message['effect']
    params = message['params']
    
    # Log effect application
    print(f"Applying {effect_name} with params: {params}")
    
    # Send confirmation
    response = {
        'type': 'effect_applied',
        'effect': effect_name,
        'params': params,
        'success': True
    }
    
    await manager.send_personal_message(response, session_id)

async def cleanup_session(session_id: str):
    if session_id in manager.audio_sessions:
        print(f"Cleaning up session: {session_id}")
        # Perform cleanup operations
        
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

##  Step 6: Main Voice Assistant Component

```typescript
// components/VoiceAssistant.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io, Socket } from 'socket.io-client';
import { AudioProcessor } from '../utils/audioProcessor';
import { OpenAIRealtimeService } from '../services/openaiRealtime';
import { startRecording, stopRecording, setEffect } from '../store/audioSlice';

export const VoiceAssistant: React.FC = () => {
  const dispatch = useDispatch();
  const { isRecording, currentEffect } = useSelector((state: any) => state.audio);
  
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const realtimeServiceRef = useRef<OpenAIRealtimeService | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeServices();
    return () => cleanup();
  }, []);

  const initializeServices = async () => {
    try {
      // Initialize audio processor
      audioProcessorRef.current = new AudioProcessor();
      
      // Initialize OpenAI Realtime service
      realtimeServiceRef.current = new OpenAI
Service(
        process.env.NEXT_PUBLIC_OPENAI_API_KEY!,
        handleRealtimeMessage
      );
      
      // Connect WebSocket to backend
      socketRef.current = new WebSocket(`ws://localhost:8000/ws/${Date.now()}`);
      socketRef.current.onmessage = handleBackendMessage;
      
      setIsInitialized(true);
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  };

  const handleRealtimeMessage = (message: any) => {
    if (message.type === 'function_call') {
      const { effect, action, value } = message.data;
      dispatch(setEffect({ effect, params: { action, value } }));
      
      // Apply effect through audio processor
      audioProcessorRef.current?.applyEffect(effect, { [action]: value });
      
      // Send to backend for processing
      socketRef.current?.send(JSON.stringify({
        type: 'effect_command',
        effect,
        params: { action, value }
      }));
    }
  };

  const handleBackendMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);
    console.log('Backend message:', message);
  };

  const startSession = async () => {
    if (!isInitialized) return;

    try {
      // Start microphone
      const stream = await audioProcessorRef.current!.initializeMicrophone();
      
      // Connect to OpenAI Realtime
      await realtimeServiceRef.current!.connect();
      
      // Start recording
      dispatch(startRecording());
      
      // Set up audio processing
      audioProcessorRef.current!.connectEffectChain(['compressor', 'lowpass']);
      
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const stopSession = () => {
    dispatch(stopRecording());
    realtimeServiceRef.current?.disconnect();
    socketRef.current?.send(JSON.stringify({ type: 'stop_session' }));
  };

  const cleanup = () => {
    stopSession();
    socketRef.current?.close();
  };

  return (
    <div className="voice-assistant">
      <div className="controls">
        <button
          onClick={isRecording ? stopSession : startSession}
          className={`record-button ${isRecording ? 'recording' : ''}`}
          disabled={!isInitialized}
        >
          {isRecording ? 'Stop Call' : 'Talk'}
        </button>
      </div>
      
      <div className="status">
        <p>Status: {isRecording ? 'Recording' : 'Idle'}</p>
        {currentEffect && <p>Current Effect: {currentEffect}</p>}
      </div>
      
      <div className="upload-section">
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            // Handle file upload
            const file = e.target.files?.[0];
            if (file) {
              // Process uploaded audio file
              console.log('File uploaded:', file.name);
            }
          }}
        />
      </div>
    </div>
  );
};
```

## 🔧 Step 7: Environment Configuration

```env
# .env.local
NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
NEXT_PUBLIC_BACKEND_URL=ws://localhost:8000
```

##  Step 8: Running the Application

### Backend
```bash
cd backend
python main.py
```

### Frontend
```bash
npm run dev
```

##  Performance Optimization Tips

1. **Minimize Buffer Sizes**: Use small audio buffers (64-256 samples)
2. **Optimize Audio Context**: Set `latencyHint: 0` for lowest latency
3. **Use Efficient Effects**: Chain effects optimally to minimize processing
4. **WebSocket Optimization**: Use binary WebSocket messages for audio data
5. **Memory Management**: Clean up audio nodes and contexts properly

##  Troubleshooting

- **High Latency**: Check buffer sizes, network conditions, and audio constraints
- **Audio Not Working**: Verify microphone permissions and HTTPS context
- **Effects Not Applying**: Check Web Audio API node connections
- **WebSocket Issues**: Ensure CORS settings and proper error handling

##  Next Steps

1. Implement hot-reload effect chaining
2. Add visual node graph for effect chains
3. Integrate on-device Whisper for ASR
4. Add voice cloning capabilities
5. Implement collaborative features

This implementation provides a solid foundation for your Soundverse duplex voice assistant with real-time audio processing capabilities.