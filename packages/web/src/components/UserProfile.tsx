'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUserId } from '@/utils/userId';
import { apiFetch } from '@/utils/api-client';
import { HubQuotaBoardTab } from './HubQuotaBoardTab';

interface UserProfileProps {
  className?: string;
}

export function UserProfile({ className }: UserProfileProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showQuotaBoard, setShowQuotaBoard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const userId = getUserId();

  // 解析用户名 - 从userId中提取用户名部分
  const getUserName = () => {
    if (userId === 'default-user') return '未登录';
    const parts = userId.split(':');
    return parts.length > 1 ? parts[1] || parts[0] : parts[0];
  };

  const userName = getUserName();
  const avatarLetter = userName.charAt(0).toUpperCase();

  const handleTogglePanel = () => {
    setShowPanel(!showPanel);
  };

  const handleOpenQuotaBoard = () => {
    setShowQuotaBoard(true);
    setShowPanel(false);
  };

  const handleCloseQuotaBoard = () => {
    setShowQuotaBoard(false);
  };

  // 处理退出登录
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch('/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        // 清除 localStorage 中的用户信息
        localStorage.removeItem('cat-cafe-userId');
        // 跳转到登录页面
        router.replace('/login');
      } else {
        console.error('退出登录失败');
      }
    } catch (err) {
      console.error('退出登录错误:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 点击外部关闭面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setShowPanel(false);
      }
    };

    if (showPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPanel]);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* 用户信息栏 */}
      <button
        type="button"
        onClick={handleTogglePanel}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-gray-50 transition-colors group"
      >
        {/* 头像 */}
        <div className="w-9 h-9 rounded-full bg-cocreator-primary flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">{avatarLetter}</span>
        </div>

        {/* 用户名 */}
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-medium text-gray-900 truncate"
            title={userName}
          >
            {userName}
          </div>
        </div>

        {/* 展开图标 */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${showPanel ? 'rotate-90' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 配置面板 */}
      {showPanel && (
        <div className="absolute bottom-full left-3 right-3 mb-2 bg-white border border-gray-200 rounded-3xl shadow-lg z-50 h-[320px]">
          <div className="p-5 h-full overflow-y-auto">
            {/* 用户名显示 */}
            <div className="mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cocreator-primary flex items-center justify-center">
                  <span className="text-white font-bold text-base">{avatarLetter}</span>
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">{userName}</div>
                  <div className="text-xs text-gray-500">已登录</div>
                </div>
              </div>
            </div>

            {/* 分隔线 */}
            <div className="border-t border-gray-200 mb-4"></div>

            {/* 菜单项 */}
            <div className="space-y-4">
              <button 
                onClick={handleOpenQuotaBoard}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                用量统计
              </button>

              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                版本更新
              </button>

              <button className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md transition-colors">
                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                帮助
              </button>
            </div>

            <div className="border-t border-gray-200 mt-4"></div>

            {/* 退出登录按钮 */}
            <button
              onClick={handleLogout}
              disabled={isLoading}
              className="w-full mt-4 h-7 rounded-full bg-white border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '退出中...' : '退出登录'}
            </button>
          </div>
        </div>
      )}

      {/* 用量统计模态框 */}
      {showQuotaBoard && (
        <div 
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
          onClick={handleCloseQuotaBoard}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900">用量统计</h2>
              <button
                onClick={handleCloseQuotaBoard}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <HubQuotaBoardTab />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}