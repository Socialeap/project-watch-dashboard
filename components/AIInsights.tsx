import React, { useState, useEffect, useRef } from 'react';
import { ProjectAnalysis, ChatMessage } from '../types';
import { 
  createProjectChatSession, 
  sendChatMessage, 
  generateSpeech, 
  playRawPcm,
  connectToLiveAnalyst,
  encode,
  decodeBase64,
  decodeAudioData
} from '../services/geminiService';
import { searchProjectsInSheet } from '../services/dataService';
import { Chat } from "@google/genai";
import { VoiceRecoverySheet } from './VoiceRecoverySheet';

interface AIInsightsProps {
  projects: ProjectAnalysis[];
}

export const AIInsights: React.FC<AIInsightsProps> = ({ projects }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState<number | null>(null);
  
  const [liveTranscription, setLiveTranscription] = useState('');
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [showVoiceRecovery, setShowVoiceRecovery] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const liveSessionRef = useRef<any>(null);
  const sessionReadyRef = useRef(false);
  const audioBufferQueueRef = useRef<Uint8Array[]>([]);

  useEffect(() => {
    if (projects.length > 0) {
      const session = createProjectChatSession(projects);
      setChatSession(session);
      setMessages([{ role: 'model', text: 'Health assessment complete. Ask me anything about project status or archived history.', timestamp: new Date() }]);
    }
  }, [projects]);

  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const stopLiveMode = () => {
    setIsLiveActive(false);
    setIsLiveMode(false);
    sessionReadyRef.current = false;
    audioBufferQueueRef.current = [];
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    activeSourcesRef.current.forEach(s => s.stop());
    setLiveTranscription('');
  };

  const handleToolCall = async (fc: any) => {
    if (fc.name === 'searchProjectHistory') return await searchProjectsInSheet(fc.args.query);
    return { error: "Unknown tool" };
  };

  const startLiveMode = async () => {
    try {
      sessionReadyRef.current = false;
      audioBufferQueueRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      audioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      setIsLiveActive(true);
      setIsLiveMode(true);

      const sessionPromise = connectToLiveAnalyst(projects, {
        onAudioChunk: async (base64) => {
          const ctx = outputAudioContextRef.current;
          if (!ctx) return;
          if (ctx.state === 'suspended') await ctx.resume();
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
          const audioBuffer = await decodeAudioData(decodeBase64(base64), ctx, 24000, 1);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
          activeSourcesRef.current.add(source);
        },
        onInterrupted: () => {
          activeSourcesRef.current.forEach(s => s.stop());
          nextStartTimeRef.current = 0;
        },
        onTranscription: (text) => setLiveTranscription(text),
        onToolCall: handleToolCall,
        onTurnComplete: () => setTimeout(() => setLiveTranscription(''), 3000),
        onClose: () => stopLiveMode(),
        onError: (e) => { console.error(e); stopLiveMode(); }
      });

      // Establish the live session first, then mark it ready after a short stabilization window.
      liveSessionRef.current = await sessionPromise;

      // Some realtime clients expose an explicit start/resume method; call if present.
      try {
        const s: any = liveSessionRef.current;
        if (s?.start) await s.start();
        if (s?.resume) await s.resume();
      } catch {
        // ignore optional start hooks
      }

      // IMPORTANT: Give the websocket/stream a brief moment to enter a writable "listening" state
      // (prevents early audio frames from being silently dropped on mobile/PWA).
      await new Promise((r) => setTimeout(r, 300));
      sessionReadyRef.current = true;

      // Flush any buffered frames captured during the warm-up window.
      const queued = audioBufferQueueRef.current;
      audioBufferQueueRef.current = [];
      for (const frame of queued) {
        try {
          (liveSessionRef.current as any)?.sendRealtimeInput?.({
            media: { data: encode(frame), mimeType: 'audio/pcm;rate=16000' },
          });
        } catch {
          // If the session can't accept frames yet, re-buffer a small tail and stop flushing.
          audioBufferQueueRef.current.push(frame);
          break;
        }
      }

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);

        // Convert float32 [-1,1] -> int16 with clamping
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 32768 : s * 32767;
        }

        const frame = new Uint8Array(int16.buffer);

        // If session isn't ready yet, buffer a small amount of audio and return.
        if (!sessionReadyRef.current) {
          const q = audioBufferQueueRef.current;
          q.push(frame);
          // Keep only the most recent ~1–2 seconds worth of frames (prevents unbounded growth)
          if (q.length > 25) q.splice(0, q.length - 25);
          return;
        }

        // Send realtime audio frame
        const s: any = liveSessionRef.current;
        if (s?.sendRealtimeInput) {
          s.sendRealtimeInput({
            media: { data: encode(frame), mimeType: 'audio/pcm;rate=16000' },
          });
        }
      };
      source.connect(processor);
      const gainNode = inputCtx.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(inputCtx.destination);
    } catch (err) {
      setShowVoiceRecovery(true);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading || !chatSession) return;
    const textToSend = input;
    setMessages(prev => [...prev, { role: 'user', text: textToSend, timestamp: new Date() }]);
    setInput('');
    setLoading(true);
    try {
      const responseText = await sendChatMessage(chatSession, textToSend, async (name, args) => await handleToolCall({ name, args }));
      setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: new Date() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error communicating with analyst.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="fixed bottom-10 right-10 w-20 h-20 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl z-[45] flex items-center justify-center transition-all hover:scale-110 active:scale-90 border-4 border-indigo-400/20">
        <span className="absolute -top-1 -right-1 flex h-6 w-6">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-6 w-6 bg-indigo-400 border-2 border-slate-900"></span>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-10 h-10">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes voiceWave {
          0%, 100% { height: 10%; opacity: 0.3; }
          50% { height: 100%; opacity: 1; }
        }
        .voice-bar {
          transition: opacity 0.2s ease;
        }
        .voice-bar.active {
          animation: voiceWave 1.2s infinite ease-in-out;
        }
      `}</style>
      {showVoiceRecovery && (
        <VoiceRecoverySheet
          open={showVoiceRecovery}
          onRetry={() => {
            setShowVoiceRecovery(false);
            startLiveMode();
          }}
          onRecordFallback={() => {
            setShowVoiceRecovery(false);
          }}
          onReset={() => {
            setShowVoiceRecovery(false);
          }}
        />
      )}
      <div className="fixed inset-0 md:inset-auto md:bottom-32 md:right-10 w-full md:w-[450px] h-[100dvh] md:h-[750px] bg-slate-900 md:rounded-3xl shadow-2xl border-t md:border-4 border-slate-800 z-[60] flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
        
        <div className="bg-slate-950 border-b-2 border-slate-800 p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl transition-all ${isLiveActive ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' : 'bg-indigo-950 text-indigo-400 border border-indigo-800'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-xl text-white tracking-tighter uppercase leading-none">AI Analyst</h2>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${isLiveActive ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                {isLiveActive ? 'LIVE MIC FEED' : 'HYBRID SYSTEM'}
              </p>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="p-3 bg-slate-900 text-slate-400 rounded-full hover:text-white transition-all active:scale-90">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>

        <div className="bg-slate-900 p-4 border-b-2 border-slate-950 flex gap-4">
            <button 
              onClick={() => isLiveActive ? stopLiveMode() : startLiveMode()}
              className={`flex-1 py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl border-2 flex items-center justify-center gap-3 ${
                isLiveActive ? 'bg-red-600 border-red-500 text-white' : 'bg-indigo-600 border-indigo-500 text-white'
              }`}
            >
              {isLiveActive ? 'DISCONNECT' : 'VOICE CHAT'}
            </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/80">
          {isLiveMode ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-10 text-center relative">
                <div className="flex items-center justify-center gap-3 h-32 w-full max-w-[250px]">
                  {[...Array(9)].map((_, i) => (
                    <div
                      key={i}
                      className={`voice-bar flex-1 bg-indigo-500 rounded-full ${isLiveActive ? 'active' : ''}`}
                      style={{
                        opacity: isLiveActive ? 1 : 0.2,
                        animationDelay: `${i * 0.15}s`,
                        animationDuration: '1.2s'
                      }}
                    />
                  ))}
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-white tracking-tighter uppercase">{isLiveActive ? 'Listening...' : 'Connecting'}</h3>
                  <div className="bg-slate-900/80 border-2 border-slate-800 rounded-3xl p-8 min-h-[200px] flex items-center justify-center text-xl font-medium text-slate-200 shadow-2xl">
                    {liveTranscription || "I'm ready. Ask me about project health or history."}
                  </div>
                </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[90%] rounded-3xl px-6 py-4 text-base font-medium leading-relaxed shadow-lg ${
                      msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 border-2 border-slate-700 text-slate-100 rounded-bl-none'
                    }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && <div className="flex justify-start"><div className="bg-slate-800 px-6 py-4 rounded-3xl flex gap-2"><div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div><div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div></div></div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {!isLiveMode && (
          <div className="p-6 bg-slate-900 border-t-2 border-slate-950 pb-12 md:pb-6">
            <div className="flex gap-4 relative">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Ask a question..." className="w-full pl-6 pr-16 py-5 bg-slate-950 border-2 border-slate-800 rounded-2xl focus:border-indigo-500 outline-none text-base text-white font-medium" />
              <button onClick={handleSend} className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-500 shadow-lg active:scale-90 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6"><path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
      
      <button onClick={() => setIsOpen(false)} className="fixed bottom-10 right-10 w-20 h-20 bg-slate-800 text-slate-400 border-4 border-slate-700 rounded-full shadow-2xl z-[70] flex items-center justify-center transition-all hover:scale-110 active:scale-90 md:hidden">
         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </>
  );
};
