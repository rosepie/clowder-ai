'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/utils/api-client';
import { setUserId } from '@/utils/userId';

export default function LoginPage() {
  const [userType, setUserType] = useState<'huawei' | 'iam'>('huawei'); // 默认华为云用户
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [domainName, setDomainName] = useState(''); // 域名
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(false); // 同意条款状态
  const router = useRouter();

  // 检查是否已登录
  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const response = await apiFetch('/api/islogin');
      const data = await response.json();

      if (data.isLoggedIn) {
        // 已登录，跳转到首页
        router.replace('/');
      }
    } catch (err) {
      console.error('检查登录状态失败:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const loginData = userType === 'iam' 
        ? { userName, password, domainName, userType }
        : { password, domainName, userType };

      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();
      console.log('login->', data);
      if (data.success) {
        // 设置用户ID到localStorage
        setUserId(data.userId);
        // 登录成功，跳转到首页
        router.replace('/');
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
      console.error('登录失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 to-white px-[200px]">
      <div className="flex w-full max-w-7xl">
        <div className="w-3/4 text-gray-900 flex flex-col justify-center">
          <h1 className="text-4xl font-bold leading-[48px] mb-4">
            OfficeClaw
          </h1>
          <p className="text-2xl leading-[48px] text-gray-600 max-w-xl mb-12">
            即可部署专属AI 享 7x24 小时 稳定在线的超级助手
          </p>
          
          <div className="flex gap-6">
            <div className="w-[250px] h-[162px] border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
              <h3 className="text-lg font-semibold mb-3 text-gray-900">智能对话</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                基于先进AI模型，提供自然流畅的对话体验，支持多轮对话和上下文理解。
              </p>
            </div>
            
            <div className="w-[250px] h-[162px] border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
              <h3 className="text-lg font-semibold mb-3 text-gray-900">文档处理</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                强大的文档分析和处理能力，支持多种格式文档的智能解析和摘要生成。
              </p>
            </div>
          </div>
        </div>

        <div className="w-1/4 flex items-center justify-center">
          <div className="w-[450px] bg-white border border-gray-200 rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                欢迎使用officeClaw
              </h2>
            </div>
              <form className="space-y-6" onSubmit={handleLogin}>
                <div className="space-y-4">
                  {/* 域名输入框 */}
                  <div>
                    <input
                      id="domainName"
                      name="domainName"
                      type="text"
                      required
                      className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder={userType === 'huawei' ? '华为云账号' : '租户名'}
                      value={domainName}
                      onChange={(e) => setDomainName(e.target.value)}
                    />
                  </div>

                  {/* 用户名输入框 - IAM用户时显示 */}
                  {userType === 'iam' && (
                    <div>
                      <input
                        id="userName"
                        name="userName"
                        type="text"
                        required
                        className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="IAM用户名"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                      />
                    </div>
                  )}

                  {/* 密码输入框 */}
                  <div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="密码"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded-md">
                    {error}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={isLoading || !agreeToTerms}
                    className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? '登录中...' : '登录'}
                  </button>
                </div>

                {/* 注册和忘记密码链接 */}
                <div className="text-center mt-4">
                  <a
                    href="https://id1.cloud.huawei.com/UnifiedIDMPortal/portal/userRegister/regbyphone.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    注册
                  </a>
                  <span className="text-sm text-gray-400 mx-2">|</span>
                  <a
                    href="https://id5.cloud.huawei.com/UnifiedIDMPortal/portal/resetPwd/forgetbyid.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:text-indigo-500"
                  >
                    忘记密码
                  </a>
                </div>

                {/* 分隔线 */}
                <div className="mt-4 mb-4">
                  <div className="relative">
                    <div className="inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300"></div>
                    </div>
                  </div>
                </div>

                {/* 用户类型切换链接 */}
                <div className="text-center mb-2">
                  <span className="text-sm text-gray-600">
                    {userType === 'huawei' ? (
                      <>
                        使用 IAM 用户登录？{' '}
                        <button
                          type="button"
                          onClick={() => setUserType('iam')}
                          className="text-indigo-600 hover:text-indigo-500 font-medium"
                        >
                          切换到 IAM
                        </button>
                      </>
                    ) : (
                      <>
                        使用华为云账号登录？{' '}
                        <button
                          type="button"
                          onClick={() => setUserType('huawei')}
                          className="text-indigo-600 hover:text-indigo-500 font-medium"
                        >
                          切换到华为云
                        </button>
                      </>
                    )}
                  </span>
                </div>

                {/* 同意条款复选框 */}
                <div className="flex items-start">
                  <div className="flex items-center h-5">
                    <input
                      id="agreeToTerms"
                      name="agreeToTerms"
                      type="checkbox"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="agreeToTerms" className="text-gray-700">
                      我已阅读并同意上述内容及
                      <a href="#" className="text-indigo-600 hover:text-indigo-500">《用户协议》</a>与
                      <a href="#" className="text-indigo-600 hover:text-indigo-500">《隐私声明》</a>
                    </label>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
  );
}