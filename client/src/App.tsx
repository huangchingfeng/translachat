import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const HostChat = lazy(() => import('./pages/HostChat'));
const GuestChat = lazy(() => import('./pages/GuestChat'));

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="spinner" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-2xl font-bold text-gray-800">404 - 找不到頁面</h1>
      <Link to="/" className="text-blue-500 hover:underline">
        回到首頁
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/chat/:roomId" element={<HostChat />} />
          <Route path="/chat/:slug" element={<GuestChat />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
