// ===== Database Models =====

export interface Host {
  id: number;
  email: string;
  password: string; // bcrypt hash
  name: string;
  language: string;
  createdAt: string;
}

export interface Room {
  id: number;
  slug: string;
  hostId: number;
  label: string;
  guestName: string | null;
  guestLang: string;
  hostLang: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number;
  roomId: number;
  sender: 'host' | 'guest';
  originalText: string;
  translatedText: string | null;
  sourceLang: string;
  targetLang: string;
  createdAt: string;
}

// ===== API Types =====

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  host: { id: number; name: string; email: string };
}

export interface CreateRoomRequest {
  label: string;
  hostLang?: string;
}

export interface CreateRoomResponse extends Room {
  chatUrl: string;
}

export interface RoomListItem {
  id: number;
  slug: string;
  label: string;
  guestName: string | null;
  guestLang: string;
  hostLang: string;
  status: 'active' | 'archived';
  chatUrl: string;
  lastMessage: Message | null;
}

export interface GuestRoomInfo {
  slug: string;
  hostName: string;
  guestName: string | null;
  guestLang: string;
  hostLang: string;
}

// ===== WebSocket Events =====

export interface ClientToServerEvents {
  'room:join': (data: { slug: string; role: 'host' | 'guest' }) => void;
  'message:send': (data: { text: string; sourceLang: string }) => void;
  'language:change': (data: { lang: string }) => void;
  'typing:start': () => void;
  'typing:stop': () => void;
  'guest:setName': (data: { name: string }) => void;
}

export interface ServerToClientEvents {
  'room:joined': (data: { roomId: number; hostLang: string; guestLang: string }) => void;
  'message:new': (data: Message) => void;
  'message:error': (data: { error: string }) => void;
  'typing:indicator': (data: { sender: 'host' | 'guest'; isTyping: boolean }) => void;
  'guest:online': (data: { isOnline: boolean }) => void;
  'language:changed': (data: { lang: string; role: 'host' | 'guest' }) => void;
}

// ===== Language Config =====

export interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', flag: '🇹🇼' },
];

// 訪客 UI 多語系翻譯
export const UI_TRANSLATIONS: Record<string, Record<string, string>> = {
  'th': {
    selectLanguage: 'เลือกภาษาของคุณ',
    chatWith: 'แชทกับ',
    yourName: 'ชื่อของคุณ',
    enterName: 'กรุณาใส่ชื่อ',
    confirm: 'ตกลง',
    online: 'ออนไลน์',
    offline: 'ออฟไลน์',
    typeMessage: 'พิมพ์ข้อความ...',
    startConversation: 'เริ่มการสนทนา!',
    autoTranslated: 'ข้อความถูกแปลอัตโนมัติ',
    chatNotFound: 'ไม่พบห้องแชท',
    linkInvalid: 'ลิงก์นี้อาจไม่ถูกต้องหรือหมดอายุ',
    loading: 'กำลังโหลด...',
    myLanguage: 'ภาษาของฉัน:',
    changeLang: 'เปลี่ยนภาษา',
  },
  'vi': {
    selectLanguage: 'Chọn ngôn ngữ của bạn',
    chatWith: 'Trò chuyện với',
    yourName: 'Tên của bạn',
    enterName: 'Nhập tên của bạn',
    confirm: 'OK',
    online: 'Trực tuyến',
    offline: 'Ngoại tuyến',
    typeMessage: 'Nhập tin nhắn...',
    startConversation: 'Bắt đầu cuộc trò chuyện!',
    autoTranslated: 'Tin nhắn được dịch tự động',
    chatNotFound: 'Không tìm thấy phòng chat',
    linkInvalid: 'Liên kết này có thể không hợp lệ hoặc đã hết hạn',
    loading: 'Đang tải...',
    myLanguage: 'Ngôn ngữ:',
    changeLang: 'Đổi ngôn ngữ',
  },
  'ja': {
    selectLanguage: '言語を選択してください',
    chatWith: 'チャット相手:',
    yourName: 'お名前',
    enterName: 'お名前を入力',
    confirm: 'OK',
    online: 'オンライン',
    offline: 'オフライン',
    typeMessage: 'メッセージを入力...',
    startConversation: '会話を始めましょう！',
    autoTranslated: 'メッセージは自動翻訳されます',
    chatNotFound: 'チャットが見つかりません',
    linkInvalid: 'このリンクは無効または期限切れの可能性があります',
    loading: '読み込み中...',
    myLanguage: '言語:',
    changeLang: '言語を変更',
  },
  'ko': {
    selectLanguage: '언어를 선택하세요',
    chatWith: '대화 상대:',
    yourName: '이름',
    enterName: '이름을 입력하세요',
    confirm: '확인',
    online: '온라인',
    offline: '오프라인',
    typeMessage: '메시지 입력...',
    startConversation: '대화를 시작하세요!',
    autoTranslated: '메시지가 자동 번역됩니다',
    chatNotFound: '채팅을 찾을 수 없습니다',
    linkInvalid: '이 링크는 유효하지 않거나 만료되었을 수 있습니다',
    loading: '로딩 중...',
    myLanguage: '언어:',
    changeLang: '언어 변경',
  },
  'zh-TW': {
    selectLanguage: '請選擇您的語言',
    chatWith: '與',
    yourName: '您的名字',
    enterName: '請輸入您的名字',
    confirm: '確定',
    online: '在線',
    offline: '離線',
    typeMessage: '輸入訊息...',
    startConversation: '開始對話吧！',
    autoTranslated: '訊息會自動翻譯',
    chatNotFound: '找不到聊天室',
    linkInvalid: '此連結可能無效或已過期',
    loading: '載入中...',
    myLanguage: '語言：',
    changeLang: '切換語言',
  },
};

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.nativeName ?? code;
}

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}
