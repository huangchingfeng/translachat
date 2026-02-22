import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { createSocket, disconnectSocket } from '../lib/socket';
import { SUPPORTED_LANGUAGES, getLanguageFlag, type Message } from '../../../shared/types';
import type { RoomListItem } from '../../../shared/types';

// 快速話語分類
const QUICK_PHRASES = [
  {
    category: '👋 打招呼',
    phrases: [
      '你好，很高興認識你',
      '你叫什麼名字？',
      '我是從台灣來的',
      '你今天過得好嗎？',
      '你好漂亮',
    ],
  },
  {
    category: '💬 聊天',
    phrases: [
      '你喜歡做什麼？',
      '你平常休假都做什麼？',
      '你喜歡吃什麼？',
      '你有推薦的餐廳嗎？',
      '你會說中文嗎？',
    ],
  },
  {
    category: '😍 讚美',
    phrases: [
      '你的笑容很迷人',
      '你的眼睛好美',
      '跟你聊天很開心',
      '你是我今晚見過最漂亮的人',
      '你好可愛',
    ],
  },
  {
    category: '🍸 邀約',
    phrases: [
      '我可以請你喝一杯嗎？',
      '你想喝什麼？',
      '要不要一起去吃宵夜？',
      '我可以加你的 LINE 嗎？',
      '明天有空嗎？想約你出去',
      '我們可以交換電話號碼嗎？',
    ],
  },
  {
    category: '🥰 撩',
    phrases: [
      '遇見你是今晚最棒的事',
      '你讓我的心跳加速了',
      '我覺得我們很有緣',
      '你的聲音好好聽',
      '我想多了解你',
      '你是不是天使？怎麼從天上掉下來的',
    ],
  },
  {
    category: '🌙 夜間互動',
    phrases: [
      '今晚好開心',
      '這裡的氣氛好好',
      '你經常來這裡嗎？',
      '要不要跳舞？',
      '我可以坐你旁邊嗎？',
      '時間過得好快，捨不得離開',
    ],
  },
];

export default function HostChat() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const slug = searchParams.get('slug') || '';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [hostLang, setHostLang] = useState('zh-TW');
  const [roomLabel, setRoomLabel] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestOnline, setGuestOnline] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [connected, setConnected] = useState(false);
  const [guestTyping, setGuestTyping] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // 取得歷史訊息
  const fetchMessages = useCallback(async () => {
    try {
      const data = await api.get<{ messages?: Message[] } | Message[]>(`/rooms/${roomId}/messages`);
      const msgList = Array.isArray(data) ? data : (data.messages || []);
      setMessages(msgList);
    } catch {
      // api.ts handles 401 redirect automatically
    }
  }, [roomId]);

  // 取得房間資訊
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !roomId) return;

    const fetchRoom = async () => {
      try {
        const data = await api.get<{ rooms?: RoomListItem[] } | RoomListItem[]>('/rooms');
        const roomList = Array.isArray(data) ? data : (data.rooms || []);
        const room = roomList.find((r) => r.id === Number(roomId));
        if (room) {
          setRoomLabel(room.label);
          setGuestName(room.guestName || '');
          setHostLang(room.hostLang || 'zh-TW');
        }
      } catch {
        // ignore
      }
    };

    fetchRoom();
    fetchMessages();
  }, [roomId, fetchMessages]);

  // Socket.io 連線
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !slug) return;

    const socket = createSocket({ token });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('room:join', { slug, role: 'host' });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('message:new', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('guest:online', (data: { isOnline: boolean }) => {
      setGuestOnline(data.isOnline);
    });

    socket.on('language:changed', (data: { lang: string; role: string }) => {
      if (data.role === 'host') {
        setHostLang(data.lang);
      }
    });

    socket.on('room:joined', (data: { hostLang: string; guestLang: string }) => {
      setHostLang(data.hostLang);
    });

    socket.on('guest:typing', (data: { isTyping: boolean }) => {
      setGuestTyping(data.isTyping);
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [slug]);

  // 自動捲到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, guestTyping]);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (!socketRef.current || !slug) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      socketRef.current.emit('typing:start', { roomSlug: slug });
    }

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      socketRef.current?.emit('typing:stop', { roomSlug: slug });
    }, 1000);
  };

  const handleSend = (text?: string) => {
    const sendText = (text || input).trim();
    if (!sendText || !socketRef.current) return;

    if (isTypingRef.current) {
      isTypingRef.current = false;
      socketRef.current.emit('typing:stop', { roomSlug: slug });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    }

    socketRef.current.emit('message:send', { text: sendText, sourceLang: hostLang });
    if (!text) setInput('');
  };

  const handleQuickPhrase = (phrase: string) => {
    handleSend(phrase);
    setShowPhrases(false);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/chat/${slug}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const handleLanguageChange = (lang: string) => {
    setHostLang(lang);
    if (socketRef.current) {
      socketRef.current.emit('language:change', { lang });
    }
  };

  // 語音輸入
  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      alert('您的瀏覽器不支援語音輸入');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = hostLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => prev + transcript);
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

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-400 hover:text-gray-200 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="font-bold text-gray-100">{roomLabel || '聊天室'}</h1>
                <div className="flex items-center gap-1.5">
                  {guestOnline && <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                  <span className="text-xs text-gray-400">
                    {guestName || '等待訪客加入...'}
                    {guestName && (guestOnline ? ' - 在線' : ' - 離線')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {slug && (
                <button
                  onClick={handleCopyLink}
                  className="text-xs text-purple-300 bg-purple-900/50 hover:bg-purple-800/60 px-3 py-1.5 rounded-lg transition flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  {linkCopied ? '已複製!' : '複製連結'}
                </button>
              )}
              {!connected && (
                <span className="text-xs text-amber-400 bg-amber-900/40 px-2 py-1 rounded">連線中...</span>
              )}
            </div>
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">我的語言:</span>
            <select
              value={hostLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-purple-500 outline-none"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-gray-600 text-sm py-10">
              還沒有訊息，開始聊天吧
            </p>
          )}
          {messages.map((msg) => {
            const isHost = msg.sender === 'host';
            return (
              <div
                key={msg.id}
                className={`flex ${isHost ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isHost
                      ? 'bg-purple-600 text-white rounded-br-md'
                      : 'bg-gray-800 text-gray-100 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm leading-relaxed">
                    {isHost
                      ? msg.originalText
                      : (msg.translatedText || msg.originalText)}
                  </p>
                  {!isHost && msg.translatedText && msg.originalText !== msg.translatedText && (
                    <p className="text-xs mt-1 opacity-50">
                      {getLanguageFlag(msg.sourceLang)} {msg.originalText}
                    </p>
                  )}
                  {isHost && msg.translatedText && msg.originalText !== msg.translatedText && (
                    <p className="text-xs mt-1 opacity-70">
                      {msg.translatedText}
                    </p>
                  )}
                  <p className={`text-[10px] mt-1 text-right ${
                    isHost ? 'text-purple-300' : 'text-gray-500'
                  }`}>
                    {formatTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
          {guestTyping && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1">
                  <span className="typing-dot w-2 h-2 bg-gray-500 rounded-full inline-block" />
                  <span className="typing-dot w-2 h-2 bg-gray-500 rounded-full inline-block" />
                  <span className="typing-dot w-2 h-2 bg-gray-500 rounded-full inline-block" />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Phrases Panel */}
      {showPhrases && (
        <div className="bg-gray-900 border-t border-gray-800 flex-shrink-0 max-h-[45vh] overflow-hidden flex flex-col">
          {/* Category Tabs */}
          <div className="flex overflow-x-auto gap-1 px-3 pt-3 pb-2 flex-shrink-0 scrollbar-hide">
            {QUICK_PHRASES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setActiveCategory(i)}
                className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition ${
                  activeCategory === i
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {cat.category}
              </button>
            ))}
          </div>
          {/* Phrase Buttons */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-wrap gap-2">
              {QUICK_PHRASES[activeCategory].phrases.map((phrase, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickPhrase(phrase)}
                  className="text-sm bg-gray-800 hover:bg-purple-700 text-gray-200 hover:text-white px-3 py-2 rounded-xl transition border border-gray-700 hover:border-purple-600"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="bg-gray-900 border-t border-gray-800 flex-shrink-0 safe-area-bottom">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          {/* 快速話語切換 */}
          <button
            onClick={() => setShowPhrases(!showPhrases)}
            className={`p-2.5 rounded-full transition flex-shrink-0 ${
              showPhrases
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title="快速話語"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </button>

          <button
            onClick={toggleRecording}
            className={`p-2.5 rounded-full transition flex-shrink-0 ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
            placeholder="輸入訊息..."
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-full focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-sm"
          />

          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
            className="p-2.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-full transition flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
