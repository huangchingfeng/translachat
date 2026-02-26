import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { createSocket, disconnectSocket } from '../lib/socket';
import { SUPPORTED_LANGUAGES, UI_TRANSLATIONS, type Message } from '../../../shared/types';

// Emoji 分類
const EMOJI_CATEGORIES = [
  { label: '表情', emojis: '😀😂🤣😍🥰😘😊😎🤩😏🥺😢😤😱' },
  { label: '愛心', emojis: '❤️🧡💛💚💙💜🖤🤍💕💗💓💘💝💖' },
  { label: '手勢', emojis: '👋👍👎🤝🙏✌️🤞🤟🤘👏🤙💪🫶' },
  { label: '慶祝', emojis: '🎉🎊🥳🎈🎁🎀🎆🎇✨🌟⭐💫🔥' },
  { label: '食物', emojis: '🍔🍕🍜🍣🍺🍻🥂🧋🍰🍿🥤🍷🍸' },
  { label: '運動', emojis: '⚽🏀🏈⚾🎾🏐🏓🎱🏊🚴💃🕺🎮' },
];

// 將 emoji 字串拆分為陣列（處理組合 emoji）
function splitEmojis(str: string): string[] {
  // 使用 Intl.Segmenter（如果可用），否則 fallback 到 regex
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(str) as Iterable<{ segment: string }>).map(s => s.segment);
  }
  // Fallback: 使用 unicode-aware regex 拆分
  return str.match(/\p{Emoji_Presentation}(\u200d\p{Emoji_Presentation})*/gu) || Array.from(str);
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
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [roomNotFound, setRoomNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  // 新功能狀態
  const [muted, setMuted] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sttRecorderRef = useRef<MediaRecorder | null>(null);
  const sttChunksRef = useRef<Blob[]>([]);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomDataRef = useRef<{ hostName: string; guestName: string | null; guestLang: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const micPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micPressStartRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Whisper 語音輸入：所有瀏覽器都支援 MediaRecorder
  const hasVoiceInput = typeof window !== 'undefined' && !!navigator.mediaDevices;

  // i18n helper
  const t = (key: string) => UI_TRANSLATIONS[selectedLang]?.[key] || key;

  // === 通知音效 ===
  const playNotificationSound = () => {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext 不支援時靜默處理
    }
  };

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

        // Connect socket with roomSlug auth
        const socket = createSocket({ roomSlug: slug });
        socketRef.current = socket;

        socket.on('connect', () => {
          setConnectionStatus('connected');
          socket.emit('room:join', { slug, role: 'guest' });
          socket.emit('language:change', { lang: selectedLang });
        });

        socket.on('disconnect', () => {
          setConnectionStatus('disconnected');
        });

        socket.io.on('reconnect_attempt', () => {
          setConnectionStatus('reconnecting');
        });

        socket.on('message:new', (msg: Message) => {
          setMessages(prev => {
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

          // 收到 host 訊息時播放通知音效 + 發送已讀
          if (msg.sender === 'host') {
            playNotificationSound();
            // 發送已讀回執
            if (msg.id > 0) {
              socket.emit('message:read', { messageIds: [msg.id] });
            }
          }
        });

        // 已讀回執：host 讀了 guest 的訊息
        socket.on('message:read-ack', (data: { messageIds: number[]; readAt: string }) => {
          setMessages(prev => prev.map(m => {
            if (data.messageIds.includes(m.id)) {
              return { ...m, readAt: data.readAt };
            }
            return m;
          }));
        });

        // Listen to both typing events for compatibility
        const handleHostTyping = (data: { isTyping: boolean }) => {
          setIsTyping(data.isTyping);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          if (data.isTyping) {
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
          }
        };

        socket.on('host:typing', handleHostTyping);
        socket.on('typing:indicator', (data: { sender: 'host' | 'guest'; isTyping?: boolean }) => {
          if (data.sender === 'host') {
            handleHostTyping({ isTyping: data.isTyping !== false });
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
      disconnectSocket();
      socketRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
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
      messageType: 'text',
      mediaUrl: null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);

    socketRef.current.emit('message:send', { text, sourceLang: selectedLang });
    setInputText('');
    setShowEmoji(false);
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

  // === 圖片上傳 ===
  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socketRef.current) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      const mediaUrl = data.url;

      // Optimistic update
      const optimisticMsg: Message = {
        id: -Date.now(),
        roomId: 0,
        sender: 'guest',
        originalText: '',
        translatedText: null,
        sourceLang: selectedLang,
        targetLang: '',
        messageType: 'image',
        mediaUrl,
        readAt: null,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimisticMsg]);

      socketRef.current.emit('message:send', {
        text: '',
        sourceLang: selectedLang,
        messageType: 'image',
        mediaUrl,
      });
    } catch {
      // 上傳失敗靜默處理
    }

    // 清空 file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // === 語音訊息（長按錄音） ===
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (voiceIntervalRef.current) {
          clearInterval(voiceIntervalRef.current);
          voiceIntervalRef.current = null;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return; // 太短的錄音忽略

        const formData = new FormData();
        formData.append('file', audioBlob, 'voice.webm');

        try {
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) throw new Error('Upload failed');
          const data = await res.json();
          const mediaUrl = data.url;

          // Optimistic update
          const optimisticMsg: Message = {
            id: -Date.now(),
            roomId: 0,
            sender: 'guest',
            originalText: '',
            translatedText: null,
            sourceLang: selectedLang,
            targetLang: '',
            messageType: 'audio',
            mediaUrl,
            readAt: null,
            createdAt: new Date().toISOString(),
          };
          setMessages(prev => [...prev, optimisticMsg]);

          socketRef.current?.emit('message:send', {
            text: '',
            sourceLang: selectedLang,
            messageType: 'audio',
            mediaUrl,
          });
        } catch {
          // 上傳失敗靜默處理
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsVoiceRecording(true);
      setVoiceDuration(0);

      // 計時器
      voiceIntervalRef.current = setInterval(() => {
        setVoiceDuration(prev => prev + 1);
      }, 1000);
    } catch {
      // 無法取得麥克風
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsVoiceRecording(false);
    setVoiceDuration(0);
    if (voiceIntervalRef.current) {
      clearInterval(voiceIntervalRef.current);
      voiceIntervalRef.current = null;
    }
  };

  // === 麥克風按鈕：短按語音轉文字，長按 > 500ms 錄音 ===
  const handleMicMouseDown = () => {
    micPressStartRef.current = Date.now();
    micPressTimerRef.current = setTimeout(() => {
      // 長按 > 500ms，啟動錄音
      startVoiceRecording();
    }, 500);
  };

  const handleMicMouseUp = () => {
    const elapsed = Date.now() - micPressStartRef.current;
    if (micPressTimerRef.current) {
      clearTimeout(micPressTimerRef.current);
      micPressTimerRef.current = null;
    }

    if (isVoiceRecording) {
      // 正在錄音，結束錄音
      stopVoiceRecording();
    } else if (elapsed < 500) {
      // 短按，語音轉文字
      toggleSpeechToText();
    }
  };

  // Voice input (Whisper STT)
  const toggleSpeechToText = async () => {
    if (isRecording && sttRecorderRef.current) {
      sttRecorderRef.current.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      sttChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) sttChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);

        const audioBlob = new Blob(sttChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return;

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'stt.webm');
          // 送語言代碼給 Whisper（zh-TW → zh）
          const whisperLang = selectedLang.split('-')[0];
          formData.append('lang', whisperLang);

          const res = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) throw new Error('Transcription failed');
          const data = await res.json();
          if (data.text) {
            setInputText(prev => prev + data.text);
          }
        } catch {
          // 辨識失敗靜默處理
        }
      };

      sttRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      // 無法取得麥克風
    }
  };

  // === Emoji 插入 ===
  const handleEmojiClick = (emoji: string) => {
    setInputText(prev => prev + emoji);
    inputRef.current?.focus();
  };

  // Typing indicator with debounced stop
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    if (slug) {
      socketRef.current?.emit('typing:start', { roomSlug: slug });
      if (typingStopTimeoutRef.current) clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('typing:stop', { roomSlug: slug });
      }, 1000);
    }
  };

  // 格式化錄音時長
  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
          <div className="flex items-center gap-3">
            {/* 通知音效切換 */}
            <button
              onClick={() => setMuted(!muted)}
              className="text-white/80 hover:text-white transition"
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? (
                <span className="text-lg">🔕</span>
              ) : (
                <span className="text-lg">🔔</span>
              )}
            </button>

            {/* 連線狀態 */}
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-300' :
                connectionStatus === 'reconnecting' ? 'bg-yellow-300 animate-pulse' :
                'bg-red-400'
              }`} />
              <span className="text-xs text-blue-200">{t(connectionStatus)}</span>
            </div>
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
          const msgType = msg.messageType || 'text';

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
                  {/* 圖片訊息 */}
                  {msgType === 'image' && msg.mediaUrl && (
                    <img
                      src={msg.mediaUrl}
                      alt="image"
                      className="max-w-[200px] rounded-xl cursor-pointer"
                      onClick={() => setFullscreenImage(msg.mediaUrl)}
                    />
                  )}

                  {/* 語音訊息 */}
                  {msgType === 'audio' && msg.mediaUrl && (
                    <audio controls className="max-w-[220px]" preload="metadata">
                      <source src={msg.mediaUrl} />
                    </audio>
                  )}

                  {/* 文字訊息 */}
                  {msgType === 'text' && (
                    <>
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
                    </>
                  )}
                </div>

                {/* Timestamp + 已讀標記 */}
                <div className={`flex items-center gap-1 mt-0.5 px-1 ${isGuest ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] text-gray-400">
                    {formatTime(msg.createdAt)}
                  </span>
                  {/* Guest 發送的訊息顯示已讀標記 */}
                  {isGuest && msg.id > 0 && (
                    <span className={`text-[10px] ${msg.readAt ? 'text-blue-500' : 'text-gray-400'}`}>
                      {msg.readAt ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-gray-400">{t('typing')}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Panel */}
      {showEmoji && (
        <div className="bg-white border-t border-gray-200 max-h-[35vh] overflow-hidden flex flex-col">
          {/* Category Tabs */}
          <div className="flex overflow-x-auto gap-1 px-3 pt-3 pb-2 flex-shrink-0">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setEmojiCategory(i)}
                className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition ${
                  emojiCategory === i
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Emoji Grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-wrap gap-1">
              {splitEmojis(EMOJI_CATEGORIES[emojiCategory].emojis).map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleEmojiClick(emoji)}
                  className="text-2xl w-10 h-10 flex items-center justify-center hover:bg-gray-100 rounded-lg transition active:scale-90"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-3 py-2 safe-area-bottom">
        {/* 錄音中提示 */}
        {isVoiceRecording && (
          <div className="flex items-center justify-center gap-2 py-2 mb-2 bg-red-50 rounded-xl">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-600 font-medium">
              {formatDuration(voiceDuration)}
            </span>
            <span className="text-xs text-red-400">Recording...</span>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-center gap-2">
          {/* 圖片上傳按鈕 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
          >
            <span className="text-lg">📎</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* Emoji 按鈕 */}
          <button
            type="button"
            onClick={() => setShowEmoji(!showEmoji)}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
              showEmoji
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            <span className="text-lg">😀</span>
          </button>

          {/* Mic button: short press = STT, long press = voice recording */}
          {hasVoiceInput && (
            <button
              type="button"
              onMouseDown={handleMicMouseDown}
              onMouseUp={handleMicMouseUp}
              onMouseLeave={() => {
                // 滑出按鈕時也結束
                if (isVoiceRecording) stopVoiceRecording();
                if (micPressTimerRef.current) {
                  clearTimeout(micPressTimerRef.current);
                  micPressTimerRef.current = null;
                }
              }}
              onTouchStart={handleMicMouseDown}
              onTouchEnd={handleMicMouseUp}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition ${
                isVoiceRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : isRecording
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {isRecording || isVoiceRecording ? (
                <span className="relative flex items-center justify-center">
                  {isVoiceRecording && (
                    <span className="absolute w-6 h-6 bg-red-400 rounded-full animate-ping opacity-40" />
                  )}
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

      {/* 圖片全螢幕 Overlay */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setFullscreenImage(null)}
        >
          <img
            src={fullscreenImage}
            alt="fullscreen"
            className="max-w-full max-h-full object-contain p-4"
          />
        </div>
      )}
    </div>
  );
}
