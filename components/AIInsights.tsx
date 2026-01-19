import React, { useState, useEffect, useRef } from 'react';
import { ProjectAnalysis, ChatMessage } from '../types';
import { 
  createProjectChatSession, 
  sendChatMessage, 
  sendVoiceMessage,
  speakText,
  stopSpeaking,
} from '../services/geminiService';
import { searchProjectsInSheet } from '../services/dataService';
import { Chat } from "@google/genai";

interface AIInsightsProps {
  projects: ProjectAnalysis[];
}

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

export const AIInsights: React.FC<AIInsightsProps> = ({ projects }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Voice state machine: idle → recording → processing → speaking → idle
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize chat session when projects load
  useEffect(() => {
    if (projects.length > 0) {
      const session = createProjectChatSession(projects);
      setChatSession(session);
      setMessages([{ 
        role: 'model', 
        text: 'Health assessment complete. Ask me anything about project status or archived history.', 
        timestamp: new Date() 
      }]);
    }
  }, [projects]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (isOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Load voices on mount (needed for some browsers)
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleToolCall = async (name: string, args: any) => {
    if (name === 'searchProjectHistory') {
      return await searchProjectsInSheet(args.query);
    }
    return { error: "Unknown tool" };
  };

  /**
   * Get the best supported MIME type for MediaRecorder
   */
  const pickRecorderMimeType = (): string => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
    ];
    for (const mimeType of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
      } catch {}
    }
    return '';
  };

  /**
   * Start recording audio from microphone
   */
  const startRecording = async () => {
    setVoiceError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mimeType = pickRecorderMimeType();
      audioChunksRef.current = [];
      
      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType }) 
        : new MediaRecorder(stream);
      
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop stream tracks
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        
        // Process the recorded audio
        await processRecordedAudio(recorder.mimeType || mimeType || 'audio/webm');
      };

      recorder.start(250); // Collect data every 250ms
      setVoiceState('recording');
    } catch (error) {
      console.error("Microphone error:", error);
      setVoiceError('Microphone unavailable. Please check permissions.');
      setVoiceState('idle');
    }
  };

  /**
   * Stop recording and trigger processing
   */
  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      setVoiceState('processing');
    }
  };

  /**
   * Process the recorded audio: transcribe, send to AI, speak response
   */
  const processRecordedAudio = async (mimeType: string) => {
    try {
      if (audioChunksRef.current.length === 0) {
        setVoiceError("No audio recorded. Please try again.");
        setVoiceState('idle');
        return;
      }

      // Create blob from chunks
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      
      if (!chatSession) {
        setVoiceError("AI service not initialized.");
        setVoiceState('idle');
        return;
      }

      // Send voice message and get response
      const { transcript, response } = await sendVoiceMessage(
        audioBlob, 
        chatSession,
        handleToolCall
      );

      if (!transcript) {
        setVoiceError("Couldn't transcribe that. Please speak clearly and try again.");
        setVoiceState('idle');
        return;
      }

      // Add user message to chat
      setMessages(prev => [...prev, { 
        role: 'user', 
        text: transcript, 
        timestamp: new Date() 
      }]);

      // Add AI response to chat
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: response, 
        timestamp: new Date() 
      }]);

      // Speak the response
      setVoiceState('speaking');
      await speakText(response);
      setVoiceState('idle');

    } catch (error) {
      console.error("Voice processing error:", error);
      setVoiceError('Voice processing failed. Please try again.');
      setVoiceState('idle');
    }
  };

  /**
   * Toggle voice recording on/off
   */
  const handleVoiceButton = () => {
    if (voiceState === 'recording') {
      stopRecording();
    } else if (voiceState === 'idle') {
      startRecording();
    } else if (voiceState === 'speaking') {
      // Allow stopping speech
      stopSpeaking();
      setVoiceState('idle');
    }
    // Don't do anything if processing
  };

  /**
   * Handle text message send
   */
  const handleSend = async () => {
    if (!input.trim() || loading || !chatSession) return;
    
    const textToSend = input;
    setMessages(prev => [...prev, { role: 'user', text: textToSend, timestamp: new Date() }]);
    setInput('');
    setLoading(true);
    
    try {
      const responseText = await sendChatMessage(chatSession, textToSend, handleToolCall);
      setMessages(prev => [...prev, { role: 'model', text: responseText, timestamp: new Date() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'model', text: 'Error communicating with analyst.', timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Get button appearance based on voice state
   */
  const getVoiceButtonStyle = () => {
    switch (voiceState) {
      case 'recording':
        return 'bg-red-600 border-red-500 text-white animate-pulse';
      case 'processing':
        return 'bg-amber-500 border-amber-400 text-white cursor-wait';
      case 'speaking':
        return 'bg-green-600 border-green-500 text-white';
      default:
        return 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500';
    }
  };

  const getVoiceButtonText = () => {
    switch (voiceState) {
      case 'recording':
        return 'FINISHED';
      case 'processing':
        return 'PROCESSING...';
      case 'speaking':
        return 'STOP SPEAKING';
      default:
        return 'SPEAK';
    }
  };

  const getVoiceButtonIcon = () => {
    switch (voiceState) {
      case 'recording':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
          </svg>
        );
      case 'processing':
        return (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        );
      case 'speaking':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
          </svg>
        );
    }
  };

  // Collapsed state - just show the fab button
  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="fixed bottom-10 right-10 w-20 h-20 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl z-[45] flex items-center justify-center transition-all hover:scale-110 active:scale-90 border-4 border-indigo-400/20"
      >
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
      <div className="fixed inset-0 md:inset-auto md:bottom-32 md:right-10 w-full md:w-[450px] h-[100dvh] md:h-[750px] bg-slate-900 md:rounded-3xl shadow-2xl border-t md:border-4 border-slate-800 z-[60] flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
        
        {/* Header */}
        <div className="bg-slate-950 border-b-2 border-slate-800 p-6 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl transition-all ${
              voiceState === 'recording' 
                ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
                : voiceState === 'speaking'
                ? 'bg-green-600 text-white shadow-[0_0_15px_rgba(22,163,74,0.5)]'
                : 'bg-indigo-950 text-indigo-400 border border-indigo-800'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            </div>
            <div>
              <h2 className="font-black text-xl text-white tracking-tighter uppercase leading-none">AI Analyst</h2>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${
                voiceState === 'recording' ? 'text-red-400 animate-pulse' :
                voiceState === 'processing' ? 'text-amber-400' :
                voiceState === 'speaking' ? 'text-green-400' :
                'text-slate-500'
              }`}>
                {voiceState === 'recording' ? 'RECORDING...' :
                 voiceState === 'processing' ? 'PROCESSING...' :
                 voiceState === 'speaking' ? 'SPEAKING...' :
                 'READY'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => {
              stopSpeaking();
              setIsOpen(false);
            }} 
            className="p-3 bg-slate-900 text-slate-400 rounded-full hover:text-white transition-all active:scale-90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Voice Button */}
        <div className="bg-slate-900 p-4 border-b-2 border-slate-950 flex gap-4">
          <button
            onClick={handleVoiceButton}
            disabled={voiceState === 'processing'}
            className={`flex-1 py-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-xl border-2 flex items-center justify-center gap-3 ${getVoiceButtonStyle()}`}
          >
            {getVoiceButtonIcon()}
            {getVoiceButtonText()}
          </button>
        </div>

        {/* Error/Status Display */}
        {voiceError && (
          <div className="px-6 py-3 bg-red-950/50 border-b border-red-900">
            <p className="text-red-400 text-sm font-semibold">{voiceError}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-950/80">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[90%] rounded-3xl px-6 py-4 text-base font-medium leading-relaxed shadow-lg ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-slate-800 border-2 border-slate-700 text-slate-100 rounded-bl-none'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 px-6 py-4 rounded-3xl flex gap-2">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Text Input */}
        <div className="p-6 bg-slate-900 border-t-2 border-slate-950 pb-12 md:pb-6">
          <div className="flex gap-4 relative">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
              placeholder="Ask a question..." 
              className="w-full pl-6 pr-16 py-5 bg-slate-950 border-2 border-slate-800 rounded-2xl focus:border-indigo-500 outline-none text-base text-white font-medium" 
            />
            <button 
              onClick={handleSend} 
              className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 text-white rounded-xl flex items-center justify-center hover:bg-indigo-500 shadow-lg active:scale-90 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.414 4.925A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile close button */}
      <button 
        onClick={() => {
          stopSpeaking();
          setIsOpen(false);
        }} 
        className="fixed bottom-10 right-10 w-20 h-20 bg-slate-800 text-slate-400 border-4 border-slate-700 rounded-full shadow-2xl z-[70] flex items-center justify-center transition-all hover:scale-110 active:scale-90 md:hidden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </>
  );
};
