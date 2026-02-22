import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS, type Message } from '../../../shared/types';

// SpeechRecognition type
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function GuestChat() {
  const { slug } = useParams<{ slug: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedLang, setSelectedLang] = useState('');
  const [langSelected, setLangSelected] = useState(false);
  const [hostName, setHostName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomDataRef = useRef<{ hostName: string; guestName: string | null; guestLang: string } | null>(null);

  const hasSpeechRecognition = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  // i18n helper
  const t = (key: string) => UI_TRANSLATIONS[selectedLang]?.[key] || key;

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Language selected -> fetch room info and connect socket
  useEffect(() => {
    if (!slug || !langSelected) return;

    let socket: Socket;

    const init = async () => {
      setLoading(true);
      try {
        // Fetch room info
        const roomRes = await fetch(`/api/chat/${slug}`);
        if (!roomRes.ok) {
          setRoomNotFound(true);
          setLoading(false);
          return;
        }
        const roomData = await roomRes.json();
        roomDataRef.current = roomData;
        setHostName(roomData.hostName);
        if (roomData.guestName) {
          setGuestName(roomData.guestName);
        } else {
          setShowNamePrompt(true);
        }

        // Fetch message history
        const msgRes = await fetch(`/api/chat/${slug}/messages`);
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData);
        }

        setLoading(false);

        // Connect socket
        socket = io(window.location.origin);
        socketRef.current = socket;

        socket.on('connect', () => {
          setIsConnected(true);
          socket.emit('room:join', { slug, role: 'guest' });
          // Notify server of language choice
          socket.emit('language:change', { lang: selectedLang });
        });

        socket.on('disconnect', () => {
          setIsConnected(false);
        });

        socket.on('message:new', (msg: Message) => {
          setMessages(prev => {
            // Replace optimistic message if it matches
            const optimisticIdx = prev.findIndex(
              m => m.id < 0 && m.originalText === msg.originalText && m.sender === msg.sender
            );
            if (optimisticIdx !== -1) {
              const updated = [...prev];
              updated[optimisticIdx] = msg;
              return updated;
            }
            return [...prev, msg];
          });
        });

        socket.on('typing:indicator', (data: { sender: 'host' | 'guest'; isTyping?: boolean }) => {
          if (data.sender === 'host') {
            setIsTyping(data.isTyping !== false);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (data.isTyping !== false) {
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
            }
          }
        });

        socket.on('language:changed', (data: { lang: string; role: 'host' | 'guest' }) => {
          if (data.role === 'guest') {
            setSelectedLang(data.lang);
          }
        });
      } catch {
        setRoomNotFound(true);
        setLoading(false);
      }
    };

    init();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [slug, langSelected]);

  // Handle language selection from the welcome page
  const handleLangSelect = (langCode: string) => {
    setSelectedLang(langCode);
    setLangSelected(true);
  };

  // Send message
  const handleSend = (e?: FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !socketRef.current) return;

    // Optimistic update
    const optimisticMsg: Message = {
      id: -Date.now(),
      roomId: 0,
      sender: 'guest',
      originalText: text,
      translatedText: null,
      sourceLang: selectedLang,
      targetLang: '',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    socketRef.current.emit('message:send', { text, sourceLang: selectedLang });
    setInputText('');
    inputRef.current?.focus();
  };

  // Language change (in-chat dropdown)
  const handleLangChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    setSelectedLang(lang);
    socketRef.current?.emit('language:change', { lang });
  };

  // Guest name submit
  const handleNameSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = nameInput.trim();
    if (!name) return;
    setGuestName(name);
    setShowNamePrompt(false);
    socketRef.current?.emit('guest:setName', { name });
  };

  // Voice input
  const toggleRecording = () => {
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new (SpeechRecognition as new () => SpeechRecognitionInstance)();
    recognition.lang = selectedLang;
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInputText(prev => prev + transcript);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  // Typing indicator
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    socketRef.current?.emit('typing:start');
  };

  // === Language Selection Page ===
  if (!langSelected) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-6">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🌐</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">TranslaChat</h1>
          <p className="text-gray-400 text-sm">Select your language / Choose your language</p>
        </div>

        <div className="w-full max-w-sm space-y-3">
          {SUPPORTED_LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => handleLangSelect(lang.code)}
              className="w-full flex items-center gap-4 px-5 py-4 bg-white border border-gray-200 rounded-2xl shadow-sm hover:border-blue-400 hover:shadow-md active:scale-[0.98] transition-all"
            >
              <span className="text-3xl">{lang.flag}</span>
              <span className="text-lg font-medium text-gray-700">{lang.nativeName}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // === Loading state ===
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-500">{t('loading')}</p>
        </div>
      </div>
    );
  }

  // === Room not found ===
  if (roomNotFound) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">{t('chatNotFound')}</h2>
          <p className="text-gray-500">{t('linkInvalid')}</p>
        </div>
      </div>
    );
  }

  // === Chat UI ===
  return (
    <div className="h-dvh flex flex-col bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-blue-600 text-white px-4 py-3 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">TranslaChat</h1>
            <p className="text-sm text-blue-100">
              {hostName ? `${t('chatWith')} ${hostName}` : t('loading')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${isConnected ? 'bg-green-300' : 'bg-red-400'}`} />
            <span className="text-xs text-blue-200">{isConnected ? t('online') : t('offline')}</span>
          </div>
        </div>
      </header>

      {/* Language selector */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <span className="text-sm text-gray-500 whitespace-nowrap">{t('myLanguage')}</span>
        <select
          value={selectedLang}
          onChange={handleLangChange}
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        >
          {SUPPORTED_LANGUAGES.map(lang => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.nativeName}
            </option>
          ))}
        </select>
      </div>

      {/* Guest name prompt */}
      {showNamePrompt && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-3">
          <form onSubmit={handleNameSubmit} className="flex items-center gap-2">
            <span className="text-sm text-blue-700 whitespace-nowrap">{t('yourName')}:</span>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t('enterName')}
              className="flex-1 text-sm border border-blue-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 transition"
            >
              {t('confirm')}
            </button>
          </form>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-12">
            <div className="text-4xl mb-3">💬</div>
            <p className="text-sm">{t('startConversation')}</p>
            <p className="text-xs text-gray-300 mt-1">{t('autoTranslated')}</p>
          </div>
        )}

        {messages.map((msg) => {
          const isGuest = msg.sender === 'guest';

          return (
            <div
              key={msg.id}
              className={`flex ${isGuest ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] ${isGuest ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={`px-4 py-2.5 ${
                    isGuest
                      ? 'bg-blue-500 text-white rounded-2xl rounded-tr-sm'
                      : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tl-sm'
                  }`}
                >
                  {/* Main text */}
                  <p className="text-[15px] leading-relaxed break-words">
                    {isGuest ? msg.originalText : (msg.translatedText || msg.originalText)}
                  </p>

                  {/* Sub text */}
                  {isGuest && msg.translatedText && (
                    <p className="text-xs mt-1 text-white/60 break-words">
                      {msg.translatedText}
                    </p>
                  )}
                  {!isGuest && msg.translatedText && msg.translatedText !== msg.originalText && (
                    <p className="text-xs mt-1 text-gray-400 break-words">
                      {msg.originalText}
                    </p>
                  )}
                </div>

                {/* Timestamp */}
                <span className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isGuest ? 'text-right' : 'text-left'}`}>
                  {formatTime(msg.createdAt)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 safe-area-bottom">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* Mic button */}
          {hasSpeechRecognition && (
            <button
              type="button"
              onClick={toggleRecording}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                isRecording
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {isRecording ? (
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-6 h-6 bg-red-400 rounded-full animate-ping opacity-40" />
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 relative z-10">
                    <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                    <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
                  </svg>
                </span>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                  <path d="M19 11a1 1 0 10-2 0 5 5 0 01-10 0 1 1 0 10-2 0 7 7 0 006 6.93V20H8a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07A7 7 0 0019 11z" />
                </svg>
              )}
            </button>
          )}

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={t('typeMessage')}
            className="flex-1 border border-gray-300 rounded-full px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />

          {/* Send button */}
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="flex-shrink-0 w-10 h-10 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white rounded-full flex items-center justify-center transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
