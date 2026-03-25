'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/utils/api-client';
import { ChatContainer } from '@/components/ChatContainer';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const response = await apiFetch('/api/islogin');
      const data = await response.json();

      if (data.isLoggedIn) {
        setIsLoggedIn(true);
      } else {
        // 未登录，跳转到登录页面
        router.replace('/login');
      }
    } catch (err) {
      console.error('检查登录状态失败:', err);
      // 出错时也跳转到登录页面
      router.replace('/login');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null; // 会被重定向，不渲染内容
  }

  return <ChatContainer threadId="default" />;
}
