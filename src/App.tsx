import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  MessageSquare, 
  Settings, 
  Calendar, 
  User, 
  Phone, 
  Stethoscope, 
  CheckCircle, 
  Trash2, 
  Activity,
  Terminal,
  History,
  Play,
  Pause,
  AlertCircle,
  Volume2,
  VolumeX,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Appointment {
  id: string;
  patientName: string;
  phoneNumber: string;
  problem: string;
  time: string;
  date: string;
  status: 'Confirmed' | 'Pending';
  doctor: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// --- Constants ---
const ACCENT_COLOR = "#2EF2E2";
const BG_COLOR = "#0F2F2F";

const SYSTEM_INSTRUCTION = `You are a professional AI voice assistant for "XYZ Hospital". 
Your goal is to book appointments using a natural, human-like conversation.

VOICE GUIDELINES:
- BE EXTREMELY CONCISE AND HUMAN. Use short, natural phrases (e.g., "Got it," "Sure thing," "And your phone number?").
- **HUMAN SPEECH PATTERNS**: Use natural fillers frequently to sound like a real person. Incorporate "um," "uh," "aah," "ummm," and "okay" naturally into your sentences. 
  - Example: "Um, okay, got it. And, uh, what's the reason for your visit today?"
  - Example: "Aah, I see. Let me, um, check the schedule for you."
- Avoid long sentences or formal "AI-sounding" explanations.
- Speak like a friendly, helpful receptionist who is thinking and responding in real-time.

VALIDATION RULES:
- NAME: If the name provided doesn't sound like a real person's name (e.g., random letters, objects, or gibberish), ask: "Are you sure this is your name? Can you confirm it once again?"
- PHONE: A valid phone number should typically be 10 digits. If the user provides a number with only 9 digits or it seems irrelevant, ask: "I'm sorry, there is only nine digits. Can you confirm the number once again?"
- REASON: If the reason for the visit doesn't seem like a valid health issue or medical concern (e.g., "I want to buy a car"), ask: "I'm sorry, I didn't quite catch that. What's the medical reason for your visit today?"

CONVERSATION FLOW & CONFIRMATION:
1. GREETING: "Hi, I'm XYZ Hospital agent. How can I assist you today?"
2. STEP-BY-STEP: Collect information one by one. After the user provides a piece of info, VALIDATE IT and then CONFIRM IT before moving to the next.
   - User gives name -> Validate -> Agent: "Thanks, [Name]. And what's your phone number?"
   - User gives phone -> Validate -> Agent: "Got it. What's the reason for your visit?"
   - User gives reason -> Validate -> Agent: "Understood. What date and time works for you?"
   - User gives date/time -> Agent: **CRITICAL**: Check the "CURRENT BOOKED APPOINTMENTS" list provided in your context. 
     - If the slot is FREE: "Perfect. So, an appointment for [Name] on [Date] at [Time] for [Reason]. Is that correct?"
     - If the slot is TAKEN: "Oh, I'm sorry, we actually have someone scheduled for [Time] already. Would [Time + 15 mins] or [Time + 30 mins] work for you instead?"
3. UPDATING: If a user asks to change or update their existing appointment (e.g., "I want to move my 2 PM to 3:30 PM"), follow the same validation steps and confirm the new details. The system will automatically update their existing record based on their phone number.
4. FINAL BOOKING: ONLY when the user says "Yes" or confirms the final summary, output the BOOK_APPOINTMENT marker.

BOOKING MARKER:
- ONLY output this at the very end after the user confirms the final summary.
- Format: "Confirmed! I've scheduled that for you. BOOK_APPOINTMENT:{"name": "...", "phone": "...", "problem": "...", "time": "...", "date": "..."}"

AVAILABLE DOCTORS:
- Dr. Smith (General Physician), Dr. Sarah (Pediatrician), Dr. Mike (Orthopedic).

Current Date: ${new Date().toLocaleDateString()}
`;

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [view, setView] = useState<'agent' | 'admin'>('agent');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [showLogs, setShowLogs] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // --- Initialization ---
  useEffect(() => {
    // Fetch appointments from backend
    fetchAppointments();

    // Initialize Speech Recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; // Turn-based
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let currentInterim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const final = event.results[i][0].transcript;
            setTranscript(final);
            setInterimTranscript("");
            // Stop listening and process
            recognitionRef.current.stop();
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        setInterimTranscript(currentInterim);
      };

      recognitionRef.current.onerror = (event: any) => {
        addLog(`[FRAMEWORK] STT Error: ${event.error}`, 'error');
        if (event.error === 'network') {
          addLog("[FRAMEWORK] Network error detected. Check your internet connection.", 'error');
        }
        setIsListening(false);
        setAgentStatus('idle');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (agentStatus === 'listening') {
          setAgentStatus('idle');
        }
        addLog("[FRAMEWORK] Microphone closed.");
      };
    }

    // Initialize Speech Synthesis and find a female voice
    const synth = window.speechSynthesis;
    synthRef.current = synth;

    const loadVoices = () => {
      const voices = synth.getVoices();
      // Try to find a high-quality female voice
      const femaleVoice = voices.find(v => 
        (v.name.includes('Female') || v.name.includes('Google US English') || v.name.includes('Zira') || v.name.includes('Samantha')) && 
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en'));
      
      if (femaleVoice) {
        setSelectedVoice(femaleVoice);
        addLog(`[FRAMEWORK] Voice selected: ${femaleVoice.name}`);
      }
    };

    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  // Handle transcript changes to trigger processing
  useEffect(() => {
    if (transcript && !isListening && !isProcessing) {
      handleUserMessage(transcript);
    }
  }, [transcript, isListening]);

  const fetchAppointments = async () => {
    try {
      const res = await fetch('/api/appointments');
      const data = await res.json();
      setAppointments(data);
      addLog("[FRAMEWORK] Fetched appointments from database.");
    } catch (e) {
      addLog("[FRAMEWORK] Failed to fetch appointments.", 'error');
    }
  };

  const addLog = (log: string, type: 'info' | 'error' | 'success' | 'ai' = 'info') => {
    setDebugLogs(prev => [`[${new Date().toLocaleTimeString()}] ${log}`, ...prev].slice(0, 100));
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // --- Core Functions ---

  const speak = (text: string, onEnd?: () => void) => {
    if (!synthRef.current || isMuted) {
      if (onEnd) onEnd();
      return;
    }
    
    // Clean text from system markers
    const cleanText = text.split("BOOK_APPOINTMENT:")[0].trim();
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.pitch = 1.1; // Slightly higher pitch for a more natural female tone
    utterance.rate = 1.0;
    
    utterance.onstart = () => {
      setAgentStatus('speaking');
      addLog(`[FRAMEWORK] Agent speaking: "${cleanText.substring(0, 30)}..."`);
    };
    utterance.onend = () => {
      setAgentStatus('idle');
      addLog("[FRAMEWORK] Speech finished.");
      if (onEnd) onEnd();
    };
    synthRef.current.speak(utterance);
  };

  const startInteraction = () => {
    setHasStarted(true);
    addLog("[FRAMEWORK] Initializing interaction sequence...");
    const greeting = "Hi, I'm XYZ Hospital agent. How can I assist you today?";
    setMessages([{ role: 'assistant', content: greeting }]);
    speak(greeting, () => {
      startListening();
    });
  };

  const startListening = () => {
    if (!recognitionRef.current) {
      addLog("[FRAMEWORK] STT not supported.", 'error');
      return;
    }
    setTranscript("");
    setInterimTranscript("");
    setIsListening(true);
    setAgentStatus('listening');
    try {
      recognitionRef.current.start();
      addLog("[FRAMEWORK] Listening for user input...");
    } catch (e) {
      addLog("[FRAMEWORK] STT Start failed.", 'error');
    }
  };

  const handleUserMessage = async (text: string) => {
    if (!text.trim()) return;

    setIsProcessing(true);
    setAgentStatus('thinking');
    addLog(`[FRAMEWORK] User Input Received: "${text}"`);
    addLog("[FRAMEWORK] Step 1: Updating chat history...");

    const updatedMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(updatedMessages);

    try {
      addLog("[FRAMEWORK] Step 2: Sending context to Gemini reasoning engine...");
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const contents = updatedMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      // Inject current appointments into system instruction for real-time conflict checking
      const currentAppointmentsContext = appointments.length > 0 
        ? `\n\nCURRENT BOOKED APPOINTMENTS:\n${appointments.map(a => `- ${a.date} at ${a.time} (Patient: ${a.patientName})`).join('\n')}`
        : "\n\nCURRENT BOOKED APPOINTMENTS: None.";

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + currentAppointmentsContext + "\n\nIf a user requests a time that is already booked, you MUST politely inform them and suggest the next available slot (e.g., 15 or 30 minutes later).",
        },
      });

      const responseText = response.text || "I'm sorry, I couldn't process that.";
      addLog("[FRAMEWORK] Step 3: Gemini response generated.");

      // Check for tool usage (simulated)
      if (responseText.includes("BOOK_APPOINTMENT:")) {
        addLog("[FRAMEWORK] Step 4: Booking command detected in response.");
        try {
          const jsonStr = responseText.split("BOOK_APPOINTMENT:")[1].trim();
          const data = JSON.parse(jsonStr);
          addLog(`[FRAMEWORK] Step 5: Parsing appointment data for ${data.name}...`);
          
          const existingAppt = appointments.find(a => a.phoneNumber === data.phone);
          if (existingAppt) {
            addLog(`[FRAMEWORK] Step 6: Existing appointment found for ${data.phone}. Updating...`);
          } else {
            addLog(`[FRAMEWORK] Step 6: No existing appointment for ${data.phone}. Creating new...`);
          }
          
          const newAppt: Appointment = {
            id: existingAppt ? existingAppt.id : Math.random().toString(36).substr(2, 9),
            patientName: data.name || "Unknown",
            phoneNumber: data.phone || "N/A",
            problem: data.problem || "General Checkup",
            time: data.time || "TBD",
            date: data.date || "Today",
            status: 'Confirmed',
            doctor: 'Dr. Smith (General Physician)'
          };
          
          addLog("[FRAMEWORK] Step 7: Saving to backend database...");
          await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newAppt)
          });
          
          fetchAppointments();
          addLog(`[FRAMEWORK] Success: Appointment confirmed for ${data.name}`, 'success');
        } catch (e) {
          addLog("[FRAMEWORK] Error: Failed to process booking data.", 'error');
        }
      } else {
        addLog("[FRAMEWORK] Step 4: Conversational response (no tool needed).");
      }

      const cleanResponse = responseText.split("BOOK_APPOINTMENT:")[0].trim();
      setMessages(prev => [...prev, { role: 'assistant', content: cleanResponse }]);
      
      addLog("[FRAMEWORK] Step 7: Initiating Text-to-Speech...");
      speak(cleanResponse, () => {
        addLog("[FRAMEWORK] Step 8: Returning to listening state.");
        startListening();
      });

    } catch (error) {
      addLog(`[FRAMEWORK] API Error: ${error}`, 'error');
      const errorMsg = "I'm having trouble connecting to my brain right now. Please try again.";
      setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
      speak(errorMsg);
    } finally {
      setIsProcessing(false);
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setTranscript("");
    setInterimTranscript("");
    setDebugLogs([]);
    setHasStarted(false);
    setAgentStatus('idle');
    setIsListening(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (synthRef.current) synthRef.current.cancel();
    addLog("Conversation reset.");
  };

  const deleteAppointment = async (id: string) => {
    try {
      await fetch(`/api/appointments/${id}`, { method: 'DELETE' });
      fetchAppointments();
      addLog(`Admin: Deleted appointment ${id}`);
    } catch (e) {
      addLog("Failed to delete appointment.");
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1A1A] text-white font-sans selection:bg-[#2EF2E2]/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2EF2E2] flex items-center justify-center shadow-lg shadow-[#2EF2E2]/20">
              <Activity className="text-[#0F2F2F] w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold tracking-tight leading-none">XYZ Hospital</h1>
              <p className="text-[10px] uppercase tracking-widest text-[#2EF2E2] font-semibold opacity-80 mt-1">Live Voice Agent</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10">
              <button 
                onClick={() => setView('agent')}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${view === 'agent' ? 'bg-[#2EF2E2] text-[#0F2F2F]' : 'hover:bg-white/5'}`}
              >
                Agent
              </button>
              <button 
                onClick={() => setView('admin')}
                className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${view === 'admin' ? 'bg-[#2EF2E2] text-[#0F2F2F]' : 'hover:bg-white/5'}`}
              >
                Admin
              </button>
            </div>
            <button 
              onClick={resetConversation}
              className="p-2 hover:bg-white/10 rounded-full transition-colors opacity-60 hover:opacity-100"
              title="Reset"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {view === 'agent' ? (
          <div className="flex flex-col gap-6 items-center">
            
            {/* Status Indicator */}
            <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/10">
              <div className={`w-2 h-2 rounded-full ${agentStatus === 'idle' ? 'bg-white/20' : 'bg-[#2EF2E2] animate-pulse shadow-[0_0_8px_#2EF2E2]'}`} />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-60">
                {agentStatus === 'idle' && 'System Ready'}
                {agentStatus === 'listening' && 'Listening...'}
                {agentStatus === 'thinking' && 'Thinking...'}
                {agentStatus === 'speaking' && 'Speaking...'}
              </span>
              <div className="w-px h-3 bg-white/10 mx-1" />
              <button onClick={() => setIsMuted(!isMuted)} className="opacity-40 hover:opacity-100 transition-opacity">
                {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Main Interaction Area */}
            <div className="w-full max-w-2xl aspect-square sm:aspect-[4/3] bg-black/20 rounded-[40px] border border-white/10 relative overflow-hidden flex flex-col items-center justify-center shadow-2xl group">
              {/* Background Glow */}
              <div className={`absolute inset-0 transition-opacity duration-1000 ${agentStatus !== 'idle' ? 'opacity-20' : 'opacity-0'}`}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-radial from-[#2EF2E2]/40 to-transparent blur-3xl" />
              </div>

              {!hasStarted ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center z-10 p-8"
                >
                  <div className="w-20 h-20 bg-[#2EF2E2]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#2EF2E2]/20">
                    <Activity className="w-10 h-10 text-[#2EF2E2]" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4 tracking-tight">Hospital Voice Agent</h2>
                  <p className="text-white/40 text-sm sm:text-base mb-8 max-w-xs mx-auto">Click the button below to start a real-time conversation with our AI assistant.</p>
                  <button 
                    onClick={startInteraction}
                    className="bg-[#2EF2E2] text-[#0F2F2F] px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-[#2EF2E2]/20 hover:scale-105 transition-transform active:scale-95"
                  >
                    Start Conversation
                  </button>
                </motion.div>
              ) : (
                <div className="w-full h-full flex flex-col z-10">
                  {/* Chat History (Small) */}
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scrollbar-hide">
                    {messages.slice(-3).map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%] p-4 rounded-2xl text-sm sm:text-base ${
                          msg.role === 'user' 
                            ? 'bg-[#2EF2E2]/10 text-[#2EF2E2] border border-[#2EF2E2]/20' 
                            : 'bg-white/5 text-white/80 border border-white/10'
                        }`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Visualizer / Mic Area */}
                  <div className="p-8 flex flex-col items-center gap-6 bg-black/40 border-t border-white/5">
                    <div className="relative">
                      <div className={`absolute inset-0 rounded-full transition-all duration-500 blur-xl ${isListening ? 'bg-red-500/40 scale-150' : 'bg-[#2EF2E2]/20 scale-110'}`} />
                      <button 
                        onClick={isListening ? () => recognitionRef.current?.stop() : startListening}
                        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 relative z-10 border-4 ${
                          isListening 
                            ? 'bg-red-500 border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.5)]' 
                            : 'bg-[#2EF2E2] border-[#2EF2E2]/50 shadow-[0_0_30px_rgba(46,242,226,0.3)] hover:scale-105'
                        }`}
                      >
                        {isListening ? <MicOff className="w-10 h-10 text-white" /> : <Mic className="w-10 h-10 text-[#0F2F2F]" />}
                      </button>
                      
                      {/* Wave Animation when listening */}
                      {isListening && (
                        <div className="absolute -inset-4 flex items-center justify-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <motion.div 
                              key={i}
                              animate={{ height: [10, 40, 10] }}
                              transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                              className="w-1 bg-red-400/50 rounded-full"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-center min-h-[60px]">
                      {isListening ? (
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 animate-pulse">Listening...</p>
                          <p className="text-sm sm:text-lg text-white/80 font-medium italic">
                            {interimTranscript || transcript || "Speak now..."}
                          </p>
                        </div>
                      ) : isProcessing ? (
                        <div className="flex flex-col items-center gap-2">
                           <p className="text-[10px] font-bold uppercase tracking-widest text-[#2EF2E2]">Processing</p>
                           <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-[#2EF2E2] rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-[#2EF2E2] rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-1.5 h-1.5 bg-[#2EF2E2] rounded-full animate-bounce [animation-delay:0.4s]" />
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-white/40 font-medium">
                          {agentStatus === 'speaking' ? 'Agent is speaking...' : 'Tap the mic to respond'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Collapsible Logs (Agent View) */}
            <div className="w-full max-w-2xl">
              <button 
                onClick={() => setShowLogs(!showLogs)}
                className="w-full flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-[#2EF2E2]" />
                  <span className="text-xs font-bold uppercase tracking-widest opacity-60">Reasoning Engine</span>
                </div>
                {showLogs ? <ChevronUp className="w-4 h-4 opacity-40" /> : <ChevronDown className="w-4 h-4 opacity-40" />}
              </button>
              
              <AnimatePresence>
                {showLogs && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <div className="bg-black/40 rounded-2xl border border-white/10 p-4 font-mono text-[10px] space-y-2 h-[200px] overflow-y-auto">
                      {debugLogs.length === 0 ? (
                        <p className="opacity-20 italic">No activity logs yet...</p>
                      ) : (
                        debugLogs.map((log, i) => (
                          <div key={i} className="flex gap-2 border-b border-white/5 pb-2 last:border-0">
                            <span className="opacity-30 shrink-0">{debugLogs.length - i}</span>
                            <span className={`
                              ${log.includes('[FRAMEWORK]') ? 'text-[#2EF2E2]' : ''} 
                              ${log.includes('Success') ? 'text-green-400' : ''} 
                              ${log.includes('Error') ? 'text-red-400' : ''}
                              ${!log.includes('[FRAMEWORK]') && !log.includes('Success') && !log.includes('Error') ? 'text-white/70' : ''}
                            `}>
                              {log}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* Admin Panel */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left: Appointments */}
            <div className="lg:col-span-2 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight">Appointments</h2>
                  <p className="text-white/40 text-sm">Real-time database of all AI-booked appointments.</p>
                </div>
                <div className="bg-[#2EF2E2]/10 px-4 py-2 rounded-xl border border-[#2EF2E2]/20 flex items-center gap-2 self-start">
                  <Calendar className="w-4 h-4 text-[#2EF2E2]" />
                  <span className="text-sm font-bold text-[#2EF2E2]">{appointments.length} Total</span>
                </div>
              </div>

              {appointments.length === 0 ? (
                <div className="bg-black/20 rounded-3xl border border-white/10 p-12 sm:p-20 flex flex-col items-center justify-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 opacity-20" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">No Bookings Yet</h3>
                    <p className="text-white/40 text-sm max-w-xs mx-auto">Appointments confirmed by the Voice Agent will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {appointments.map((appt) => (
                    <motion.div 
                      layout
                      key={appt.id}
                      className="bg-black/20 rounded-3xl border border-white/10 p-6 space-y-6 hover:border-[#2EF2E2]/40 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4">
                        <div className="px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-400 uppercase tracking-widest">
                          {appt.status}
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-[#2EF2E2]/10 transition-colors">
                          <User className="w-6 h-6 opacity-40 group-hover:text-[#2EF2E2] group-hover:opacity-100 transition-all" />
                        </div>
                        <div>
                          <h4 className="font-bold text-lg">{appt.patientName}</h4>
                          <p className="text-xs opacity-40 font-mono">{appt.id}</p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm opacity-60">
                          <Phone className="w-4 h-4 text-[#2EF2E2]" />
                          <span>{appt.phoneNumber}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm opacity-60">
                          <Calendar className="w-4 h-4 text-[#2EF2E2]" />
                          <span>{appt.time} • {appt.date}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm opacity-60">
                          <Stethoscope className="w-4 h-4 text-[#2EF2E2]" />
                          <span className="truncate">{appt.problem}</span>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider opacity-40">{appt.doctor}</span>
                        </div>
                        <button 
                          onClick={() => deleteAppointment(appt.id)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: System Terminal */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-[#2EF2E2]" />
                <h3 className="text-xl font-bold">System Terminal</h3>
              </div>
              <div className="bg-black/40 rounded-3xl border border-white/10 p-6 font-mono text-[11px] h-[600px] overflow-y-auto flex flex-col-reverse gap-3 scrollbar-hide">
                {debugLogs.length === 0 ? (
                  <p className="opacity-20 italic">No framework activity...</p>
                ) : (
                  debugLogs.map((log, i) => (
                    <div key={i} className="flex gap-3 border-b border-white/5 pb-3 last:border-0">
                      <span className="opacity-20 shrink-0">{debugLogs.length - i}</span>
                      <span className={`
                        ${log.includes('[FRAMEWORK]') ? 'text-[#2EF2E2]' : ''} 
                        ${log.includes('Success') ? 'text-green-400' : ''} 
                        ${log.includes('Error') ? 'text-red-400' : ''}
                        ${!log.includes('[FRAMEWORK]') && !log.includes('Success') && !log.includes('Error') ? 'text-white/60' : ''}
                      `}>
                        {log}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
