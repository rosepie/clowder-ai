import { describe, it, expect, beforeEach } from 'node:test';
import { build } from '../helper.js';

describe('Authentication routes', () => {
  let app;

  beforeEach(async () => {
    app = await build();
  });

  describe('GET /api/islogin', () => {
    it('should return not logged in when no user header', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/islogin',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isLoggedIn).toBe(false);
    });

    it('should return logged in when user header is present', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/islogin',
        headers: {
          'x-cat-cafe-user': 'test-user',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.isLoggedIn).toBe(true);
      expect(body.userId).toBe('test-user');
    });
  });

  describe('POST /api/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: {
          username: 'admin',
          password: 'admin123',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.userId).toBe('user-admin');
      expect(body.message).toBe('登录成功');

      // Check headers
      expect(response.headers['x-cat-cafe-user']).toBe('user-admin');
      expect(response.headers['x-session-id']).toBeDefined();
    });

    it('should fail with invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: {
          username: 'admin',
          password: 'wrongpassword',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('用户名或密码错误');
    });

    it('should fail with non-existent user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: {
          username: 'nonexistent',
          password: 'password',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.message).toBe('用户名或密码错误');
    });
  });
});