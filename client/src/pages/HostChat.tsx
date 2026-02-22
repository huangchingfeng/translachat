import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';
import { createSocket, disconnectSocket } from '../lib/socket';
import { SUPPORTED_LANGUAGES, getLanguageFlag, type Message } from '../../../shared/types';
import type { RoomListItem } from '../../../shared/types';

// 快速話語分類（共 130+ 句）
const QUICK_PHRASES = [
  {
    category: '👋 打招呼',
    phrases: [
      '你好，很高興認識你',
      '你叫什麼名字？',
      '我是從台灣來的',
      '你今天過得好嗎？',
      '你好漂亮',
      '嗨，我能跟你聊聊嗎？',
      '你一個人嗎？',
      '很開心在這裡遇見你',
      '你住在這附近嗎？',
      '我第一次來這裡',
      '你來這裡多久了？',
      '你會說英文嗎？',
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
      '你最喜歡什麼音樂？',
      '你有去過台灣嗎？',
      '你做什麼工作？',
      '你最喜歡哪個季節？',
      '你喜歡旅行嗎？',
      '你有什麼興趣愛好？',
      '你最近在追什麼劇？',
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
      '你穿這件衣服很好看',
      '你的聲音好好聽',
      '你笑起來好甜',
      '你的身材好好',
      '你皮膚好好，怎麼保養的？',
      '你好有氣質',
      '你跳舞跳得好好',
      '你的髮型好漂亮',
      '你真的好美，像明星一樣',
      '我喜歡你的風格',
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
      '要不要一起去看電影？',
      '我想帶你去一個很棒的地方',
      '下次可以約你出去嗎？',
      '你明天有什麼計畫？',
      '週末要不要一起吃飯？',
      '我可以請你吃飯嗎？',
      '要不要去唱歌？',
      '我想請你去吃好吃的',
      '你喜歡去哪裡玩？我帶你去',
    ],
  },
  {
    category: '🥰 撩',
    phrases: [
      // 初次心動
      '遇見你是今晚最棒的事',
      '看到你的第一眼我就心動了',
      '你讓我的心跳加速了',
      '我覺得我們很有緣',
      '你是不是天使？怎麼從天上掉下來的',
      '你是不是偷了我的心？因為我找不到了',
      '你讓我相信一見鍾情',
      '我從進來就一直在看你',
      '你是我來這裡最大的驚喜',
      '認識你讓我覺得好幸運',
      // 讚美撩人
      '你的眼睛像星星一樣閃亮',
      '你的笑容是我今晚最美的風景',
      '你笑的時候整個世界都亮了',
      '你的美讓我說不出話',
      '你比照片還要美一百倍',
      '你知道你有多迷人嗎？',
      '你的一舉一動都讓我著迷',
      '你的嘴唇好漂亮',
      '你的香味好好聞',
      '你讓我忍不住一直看你',
      // 甜蜜告白
      '我覺得你是我的命中注定',
      '你是我見過最特別的女生',
      '我的眼裡只有你',
      '你是上天送給我的禮物',
      '你是我夢中的女孩',
      '你讓我又相信愛情了',
      '你是讓我心動的唯一',
      '我想做你身邊最特別的人',
      '做我女朋友好不好？',
      '我想當你的專屬男朋友',
      // 想靠近
      '我想多了解你',
      '我可以靠近你一點嗎？',
      '我可以牽你的手嗎？',
      '我可以抱抱你嗎？',
      '我可以親你的臉嗎？',
      '你讓我好想保護你',
      '跟你在一起我好放鬆',
      '你讓我的心融化了',
      '你住在我心裡了，不許搬走',
      '我已經離不開你了',
      // 浪漫情話
      '今晚月色真美',
      '我希望時間可以停在這一刻',
      '跟你在一起的時間過得好快',
      '我想記住今晚跟你的每個瞬間',
      '我想把最好的都給你',
      '你讓我忘記了所有煩惱',
      '我想每天都能看到你的笑容',
      '遇見你之後我就不想看別人了',
      '如果可以，我想跟你待到天亮',
      '我不想跟你說再見',
      // 深情款款
      '你是我最想帶回家的那個人',
      '如果世界末日我想跟你一起',
      '我願意為你學泰語',
      '我想用一輩子來認識你',
      '你是我今晚的專屬天使',
      '我每天都想來見你',
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
      '你想喝什麼酒？我請你',
      '今晚你最美',
      '來，乾杯！',
      '這首歌好好聽，你喜歡嗎？',
      '你跳舞的樣子好性感',
      '我們一起自拍好嗎？',
      '今晚不想回家了',
      '你想去哪裡續攤？',
      '這是我的 LINE，隨時聯絡我',
      '你喜歡喝什麼？甜的還是烈的？',
      '可以跟你拍張照嗎？',
      '你今晚幾點下班？',
      '等你下班，我在外面等你好不好？',
      '再待一下嘛，不要走',
    ],
  },
  {
    category: '💕 關心',
    phrases: [
      '你累不累？要不要休息一下？',
      '你吃飯了嗎？',
      '要注意身體，不要太累',
      '有什麼需要幫忙的嗎？',
      '你今天開心嗎？',
      '如果不舒服就不要勉強',
      '路上小心',
      '想你了',
      '到家了嗎？',
      '晚安，做個好夢',
      '早安，今天也要加油',
      '天氣熱，多喝水',
      '有空的時候跟我說',
      '你的事就是我的事',
      '不管發生什麼我都在',
    ],
  },
];

// Emoji 面板分類
const EMOJI_CATEGORIES = [
  { label: '😀 表情', emojis: ['😀','😂','🤣','😍','🥰','😘','😊','😎','🤩','😏','🥺','😢','😤','😱'] },
  { label: '❤️ 愛心', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💕','💗','💓','💘','💝','💖'] },
  { label: '👋 手勢', emojis: ['👋','👍','👎','🤝','🙏','✌️','🤞','🤟','🤘','👏','🤙','💪','🫶'] },
  { label: '🎉 慶祝', emojis: ['🎉','🎊','🥳','🎈','🎁','🎀','🎆','🎇','✨','🌟','⭐','💫','🔥'] },
  { label: '🍔 食物', emojis: ['🍔','🍕','🍜','🍣','🍺','🍻','🥂','🧋','🍰','🍿','🥤','🍷','🍸'] },
  { label: '⚽ 運動', emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏓','🎱','🏊','🚴','💃','🕺','🎮'] },
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

  // === 新增 state ===
  const [muted, setMuted] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [showEmojis, setShowEmojis] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceDuration, setVoiceDuration] = useState(0);
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const micPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micPressStartRef = useRef<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // === 通知音效 ===
  const playNotificationSound = useCallback(() => {
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
      // 忽略音效錯誤
    }
  }, [muted]);

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

      // 收到 guest 訊息時播放通知音效 + 標記已讀
      if (msg.sender === 'guest') {
        playNotificationSound();
        // 標記已讀
        socket.emit('message:read', { messageIds: [msg.id] });
      }
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

    // === 已讀回執 ===
    socket.on('message:read-ack', (data: { messageIds: number[]; readAt: string }) => {
      setMessages(prev => prev.map(m =>
        data.messageIds.includes(m.id) ? { ...m, readAt: data.readAt } : m
      ));
    });

    // === 多 Guest 人數 ===
    socket.on('room:guest-count', (data: { count: number }) => {
      setGuestCount(data.count);
    });

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [slug, playNotificationSound]);

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

  // === 發送媒體訊息（圖片/語音） ===
  const handleSendMedia = (mediaUrl: string, messageType: 'image' | 'audio') => {
    if (!socketRef.current) return;
    socketRef.current.emit('message:send', {
      text: messageType === 'image' ? '[圖片]' : '[語音訊息]',
      sourceLang: hostLang,
      messageType,
      mediaUrl,
    });
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

  // === 圖片上傳 ===
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        handleSendMedia(data.url, 'image');
      }
    } catch {
      alert('圖片上傳失敗');
    } finally {
      setUploading(false);
      // 清除 file input，讓同一張圖可以重新選擇
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // === 語音訊息上傳 ===
  const uploadAudio = async (blob: Blob) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, `voice-${Date.now()}.webm`);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        handleSendMedia(data.url, 'audio');
      }
    } catch {
      alert('語音上傳失敗');
    } finally {
      setUploading(false);
    }
  };

  // === 麥克風按鈕：短按 = 語音轉文字 / 長按 = 錄音 ===
  const handleMicDown = () => {
    micPressStartRef.current = Date.now();
    micPressTimerRef.current = setTimeout(() => {
      // 長按 > 500ms，開始錄音
      startVoiceRecording();
    }, 500);
  };

  const handleMicUp = () => {
    const elapsed = Date.now() - micPressStartRef.current;
    if (micPressTimerRef.current) {
      clearTimeout(micPressTimerRef.current);
      micPressTimerRef.current = null;
    }

    if (isVoiceRecording) {
      // 結束錄音
      stopVoiceRecording();
    } else if (elapsed < 500) {
      // 短按 -> 語音轉文字
      toggleRecording();
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) uploadAudio(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsVoiceRecording(true);
      setVoiceDuration(0);

      // 錄音計時器
      voiceTimerRef.current = setInterval(() => {
        setVoiceDuration(prev => prev + 1);
      }, 1000);
    } catch {
      alert('無法存取麥克風');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsVoiceRecording(false);
    setVoiceDuration(0);
    if (voiceTimerRef.current) {
      clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  // 語音轉文字（原有功能）
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

  // 格式化錄音時長
  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen-safe flex flex-col bg-gray-950">
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
                    {guestName && guestCount > 1 && (
                      <span className="ml-1 text-purple-300">({guestCount}人)</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 靜音切換按鈕 */}
              <button
                onClick={() => setMuted(!muted)}
                className="text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 px-2.5 py-1.5 rounded-lg transition"
                title={muted ? '開啟通知音效' : '關閉通知音效'}
              >
                {muted ? '🔕' : '🔔'}
              </button>
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
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        <div className="max-w-3xl mx-auto space-y-3">
          {messages.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-10">
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
                  {/* 圖片訊息 */}
                  {msg.messageType === 'image' && msg.mediaUrl ? (
                    <img
                      src={msg.mediaUrl}
                      alt="圖片"
                      className="max-w-[200px] rounded-xl cursor-pointer"
                      onClick={() => setFullscreenImage(msg.mediaUrl)}
                    />
                  ) : msg.messageType === 'audio' && msg.mediaUrl ? (
                    /* 語音訊息 */
                    <audio src={msg.mediaUrl} controls className="max-w-[200px]" />
                  ) : (
                    /* 文字訊息 */
                    <>
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
                    </>
                  )}
                  {/* 時間 + 已讀標記 */}
                  <p className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${
                    isHost ? 'text-purple-300' : 'text-gray-500'
                  }`}>
                    {formatTime(msg.createdAt)}
                    {isHost && (
                      <span className={msg.readAt ? 'text-blue-400' : 'text-gray-500'}>
                        {msg.readAt ? '✓✓' : '✓'}
                      </span>
                    )}
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

      {/* 圖片全螢幕查看 */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setFullscreenImage(null)}
        >
          <img
            src={fullscreenImage}
            alt="全螢幕圖片"
            className="max-w-[90vw] max-h-[90vh] object-contain"
          />
        </div>
      )}

      {/* Quick Phrases Panel */}
      {showPhrases && (
        <div className="bg-gray-900 border-t border-gray-800 flex-shrink-0 max-h-[40vh] overflow-hidden flex flex-col">
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

      {/* Emoji 面板 */}
      {showEmojis && (
        <div className="bg-gray-900 border-t border-gray-800 flex-shrink-0 max-h-[35vh] overflow-hidden flex flex-col">
          {/* Emoji Category Tabs */}
          <div className="flex overflow-x-auto gap-1 px-3 pt-3 pb-2 flex-shrink-0 scrollbar-hide">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={i}
                onClick={() => setEmojiCategory(i)}
                className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-full transition ${
                  emojiCategory === i
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Emoji Grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="flex flex-wrap gap-2">
              {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(prev => prev + emoji);
                  }}
                  className="text-2xl hover:bg-gray-700 p-2 rounded-lg transition"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 上傳中提示 */}
      {uploading && (
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 flex-shrink-0">
          <div className="max-w-3xl mx-auto flex items-center gap-2 text-gray-400 text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            上傳中...
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="bg-gray-900 border-t border-gray-800 flex-shrink-0 safe-area-bottom">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          {/* 快速話語切換 */}
          <button
            onClick={() => { setShowPhrases(!showPhrases); setShowEmojis(false); }}
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

          {/* 圖片按鈕 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 transition flex-shrink-0"
            title="傳送圖片"
          >
            <span className="text-lg leading-none">📎</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* Emoji 按鈕 */}
          <button
            onClick={() => { setShowEmojis(!showEmojis); setShowPhrases(false); }}
            className={`p-2.5 rounded-full transition flex-shrink-0 ${
              showEmojis
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title="表情貼圖"
          >
            <span className="text-lg leading-none">😀</span>
          </button>

          {/* 麥克風按鈕：短按語音轉文字 / 長按錄音 */}
          <button
            onMouseDown={handleMicDown}
            onMouseUp={handleMicUp}
            onMouseLeave={() => {
              // 防止滑出按鈕時卡住
              if (micPressTimerRef.current) {
                clearTimeout(micPressTimerRef.current);
                micPressTimerRef.current = null;
              }
              if (isVoiceRecording) stopVoiceRecording();
            }}
            onTouchStart={handleMicDown}
            onTouchEnd={handleMicUp}
            className={`p-2.5 rounded-full transition flex-shrink-0 ${
              isVoiceRecording
                ? 'bg-red-600 text-white animate-pulse'
                : isRecording
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title="短按: 語音轉文字 / 長按: 語音訊息"
          >
            {isVoiceRecording ? (
              <span className="text-xs font-mono whitespace-nowrap">🔴 {formatDuration(voiceDuration)}</span>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
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
