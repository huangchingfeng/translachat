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

export interface CreateRoomResponse {
  room: Room;
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
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface GuestRoomInfo {
  slug: string;
  hostName: string;
  guestName: string | null;
  guestLang: string;
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
  'typing:indicator': (data: { sender: 'host' | 'guest' }) => void;
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
  { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文', flag: '🇹🇼' },
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'th', name: 'Thai', nativeName: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', flag: '🇲🇾' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino', flag: '🇵🇭' },
  { code: 'zh-CN', name: 'Simplified Chinese', nativeName: '简体中文', flag: '🇨🇳' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
];

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.nativeName ?? code;
}

export function getLanguageFlag(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}
