/**
 * Authentication Routes — 用户登录认证
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export interface AuthRoutesOptions {
  // 可以在这里添加认证相关的配置
}

interface UserInfo {
  userId: string;
  token: string;
  expiresAt: string;
  credential: Record<string, string>;
}

interface TokenResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  message?: string;
}

interface CredentialResult {
  success: boolean;
  credential?: Record<string, string>;
  message?: string;
}

interface ModelInfoResult {
  success: boolean;
  modelInfo?: any;
  message?: string;
}

interface LoginBody {
  domainName: string;
  userName?: string;
  password: string;
  userType: 'huawei' | 'iam';
}

const userInfo: UserInfo = {
  userId: '',
  token: '',
  expiresAt: '',
  credential: {}
};

const IAM_URL = 'https://iam.myhuaweicloud.com';
export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {

  // 简单的session存储（生产环境应该使用Redis或数据库）
  const sessions = new Map<string, UserInfo>();

  // 检查登录状态接口
  app.get('/api/islogin', async (request, reply) => {
    const userId = request.headers['x-cat-cafe-user'] as string;
    if (!userId) {
      return { isLoggedIn: false };
    }

    // 检查session是否有效
    const session = sessions.get(userId);
    if (!session || new Date(session.expiresAt).getTime() < new Date().getTime()) {
      return { isLoggedIn: false };
    }

    return { isLoggedIn: true, userId: session.userId };
  });

  /**
   * 用户登录接口
   * 1. 验证用户名和密码
   * 2. 获取临时Token和临时访问密钥
   * 3. 创建session并返回用户信息
   */
  app.post('/api/login', async (request, reply) => {
    const { domainName, userName, password, userType } = request.body as LoginBody;
    const name = userType === 'huawei' ? domainName : userName;
    if (!domainName || !password || !name) {
      return { success: false, message: '用户名或密码错误' };
    }

    const tokenResult = await getTokens(app, domainName, name, password);

    if (!tokenResult?.success) {
      return { success: false, message: tokenResult?.message || '认证失败' };
    }

    const credentialResult = await getSecuritytokens(app, tokenResult.token);
    if (!credentialResult?.success) {
      return { success: false, message: credentialResult?.message || '认证失败' };
    }

    userInfo.userId = `${domainName}:${name ?? ''}`;
    userInfo.token = tokenResult.token ?? '';
    userInfo.expiresAt = tokenResult.expiresAt ?? '';
    userInfo.credential = credentialResult.credential ?? {};

    // 创建session（简单实现，生产环境应该生成JWT token）
    const sessionId = `session-${Date.now()}-${Math.random()}`;
    sessions.set(userInfo.userId, userInfo);
    // 设置header返回给前端
    reply.header('X-Cat-Cafe-User', userInfo.userId);
    reply.header('X-Session-Id', sessionId);

    return { success: true, userId: userInfo.userId, message: '登录成功' };
  });

  // 退出登录接口
  app.post('/api/logout', async (request) => {
    const userId = request.headers['x-cat-cafe-user'] as string;
    
    if (userId) {
      // 删除 session
      sessions.delete(userId);
    }

    return { success: true, message: '退出登录成功' };
  });
};

// 获取IAM用户Token
async function getTokens(app: FastifyInstance, domainName = '', userName = '', password = ''): Promise<TokenResult> {
  // 调用华为云认证接口
  try {
    const authResponse = await fetch(`${IAM_URL}/v3/auth/tokens`,{
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['password'],
            password: {
              user: {
                domain: {
                  name: domainName // IAM用户所属账号名
                },
                name: userName, // IAM用户名
                password: password // IAM用户密码
              }
            }
          },
          scope: {
            project: {
              name: 'cn-north-4' // 项目名称
            }
          }
        }
      })
    });

    if (!authResponse.ok) {
      throw new Error(`认证失败，状态码: ${authResponse.statusText}`);
    }
    const data: any = await authResponse.json();
    return { success: true, token: authResponse.headers.get('x-subject-token') as string, expiresAt: data.expires_at };
  } catch (error) {
    console.error('获取IAM Token失败:', error);
    return { success: false, message: '登录失败' };
  }
}

//获取用户的临时访问密钥
async function getSecuritytokens(app: FastifyInstance, token = ''): Promise<CredentialResult> {
  // 调用华为云认证接口
  try {
    const authResponse = await fetch(`${IAM_URL}/v3.0/OS-CREDENTIAL/securitytokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Auth-Token': token
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ["token"]
          }
        }
      })
    });

    if (!authResponse.ok) {
      throw new Error(`获取IAM临时访问密钥失败，状态码: ${authResponse.statusText}`);
    }
    const data: any = await authResponse.json();
    return { success: true, credential: data.credential };
  } catch (error) {
    console.error('获取IAM临时访问密钥失败:', error);
    return { success: false, message: '登录失败' };
  }
}

//开通客户端claw
async function subscriptionClaw(token = ''): Promise<ModelInfoResult> {
  // 调用华为云认证接口
  try {
    const subResponse = await fetch(`${IAM_URL}/v1/claw/client-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Auth-Token': token
      },
    });

    if (!subResponse.ok) {
      throw new Error(`开通客户端claw失败，状态码: ${subResponse.statusText}`);
    }
    const data: any = await subResponse.json();
    return { success: true, modelInfo: data.model_info };
  } catch (error) {
    console.error('开通客户端claw失败:', error);
    return { success: false, message: '登录失败' };
  }
}