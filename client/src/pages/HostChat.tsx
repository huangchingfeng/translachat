import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { SUPPORTED_LANGUAGES, getLanguageFlag, type Message } from '../../../shared/types';

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

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const token = localStorage.getItem('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // 取得歷史訊息
  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/messages`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || data);
      }
    } catch {
      // ignore
    }
  }, [roomId]);

  // 取得房間資訊
  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/rooms`, { headers });
        if (res.ok) {
          const data = await res.json();
          const roomList = data.rooms || data;
          const room = roomList.find((r: { id: number }) => r.id === Number(roomId));
          if (room) {
            setRoomLabel(room.label);
            setGuestName(room.guestName || '');
            setHostLang(room.hostLang || 'zh-TW');
          }
        }
      } catch {
        // ignore
      }
    };
    if (token && roomId) {
      fetchRoom();
      fetchMessages();
    }
  }, [token, roomId, fetchMessages]);

  // Socket.io 連線
  useEffect(() => {
    if (!token || !slug) return;

    const socket: Socket = io({
      auth: { token },
    });
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

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, slug]);

  // 自動捲到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || !socketRef.current) return;

    socketRef.current.emit('message:send', { text, sourceLang: hostLang });
    setInput('');
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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="text-gray-500 hover:text-gray-700 transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="font-bold text-gray-800">{roomLabel || '聊天室'}</h1>
                <div className="flex items-center gap-1.5">
                  {guestOnline && <span className="w-2 h-2 bg-green-400 rounded-full" />}
                  <span className="text-xs text-gray-500">
                    {guestName || '等待訪客加入...'}
                    {guestName && (guestOnline ? ' - 在線' : ' - 離線')}
                  </span>
                </div>
              </div>
            </div>
            {!connected && (
              <span className="text-xs text-orange-500 bg-orange-50 px-2 py-1 rounded">連線中...</span>
            )}
          </div>

          {/* Language Selector */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">我的語言:</span>
            <select
              value={hostLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
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
            <p className="text-center text-gray-400 text-sm py-10">
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
                      ? 'bg-blue-500 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  <p className="text-sm leading-relaxed">
                    {isHost
                      ? msg.originalText
                      : (msg.translatedText || msg.originalText)}
                  </p>
                  {!isHost && msg.translatedText && msg.originalText !== msg.translatedText && (
                    <p className="text-xs mt-1 opacity-60">
                      {getLanguageFlag(msg.sourceLang)} {msg.originalText}
                    </p>
                  )}
                  {isHost && msg.translatedText && msg.originalText !== msg.translatedText && (
                    <p className="text-xs mt-1 opacity-70">
                      {msg.translatedText}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Bar */}
      <div className="bg-white border-t border-gray-200 flex-shrink-0">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={toggleRecording}
            className={`p-2.5 rounded-full transition flex-shrink-0 ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
            placeholder="輸入訊息..."
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-full transition flex-shrink-0"
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
