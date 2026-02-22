import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { RoomListItem } from '../../../shared/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState('');
  const [hostName, setHostName] = useState('Host');

  useEffect(() => {
    // 從 token 解析 host name (PrivateRoute 已確保 token 存在)
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.name) setHostName(payload.name);
    } catch {
      // ignore
    }
  }, []);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await api.get<{ rooms?: RoomListItem[] } | RoomListItem[]>('/rooms');
      const roomList = Array.isArray(data) ? data : (data.rooms || []);
      setRooms(roomList);
    } catch {
      // api.ts handles 401 redirect automatically
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    setCreating(true);
    try {
      await api.post('/rooms', { label: newLabel.trim() });
      setNewLabel('');
      setShowForm(false);
      fetchRooms();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (roomId: number) => {
    if (!confirm('確定要刪除這個聊天室嗎？')) return;
    try {
      await api.delete(`/rooms/${roomId}`);
      fetchRooms();
    } catch {
      // ignore
    }
  };

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/chat/${slug}`;
    navigator.clipboard.writeText(url);
    setToast('已複製！');
    setTimeout(() => setToast(''), 2000);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-blue-600">TranslaChat</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:inline">{hostName}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-500 transition"
            >
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Create Room */}
        <div className="mb-6">
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新增聊天室
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="聊天室名稱，例如：前台接待"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newLabel.trim()}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition"
              >
                {creating ? '建立中...' : '建立'}
              </button>
              <button
                onClick={() => { setShowForm(false); setNewLabel(''); }}
                className="px-4 py-2.5 text-gray-500 hover:text-gray-700 transition"
              >
                取消
              </button>
            </div>
          )}
        </div>

        {/* Room List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 text-lg">還沒有聊天室，建立第一個開始聊天吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition overflow-hidden"
              >
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => navigate(`/dashboard/chat/${room.id}?slug=${room.slug}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-gray-800 text-lg">{room.label}</h3>
                    <div className="flex items-center gap-1.5">
                      {room.guestName && (
                        <span className="w-2.5 h-2.5 bg-green-400 rounded-full inline-block" />
                      )}
                    </div>
                  </div>
                  <p className={`text-sm ${room.guestName ? 'text-gray-600' : 'text-gray-400'}`}>
                    {room.guestName || '等待加入...'}
                  </p>
                  {room.lastMessage && (
                    <p className="text-xs text-gray-400 mt-2 truncate">
                      {typeof room.lastMessage === 'string' ? room.lastMessage : room.lastMessage.originalText}
                    </p>
                  )}
                </div>
                <div className="flex border-t border-gray-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopyLink(room.slug); }}
                    className="flex-1 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    複製連結
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(room.id); }}
                    className="flex-1 py-2.5 text-sm text-red-500 hover:bg-red-50 transition flex items-center justify-center gap-1 border-l border-gray-100"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-6 py-2.5 rounded-full shadow-lg text-sm animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );
}
