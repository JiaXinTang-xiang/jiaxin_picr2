import { type FormEvent, useState } from 'react';

interface LoginFormProps {
  nextPath?: string;
}

export default function LoginForm({ nextPath = '/manage' }: LoginFormProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          next: nextPath,
        }),
      });

      const data = (await response
        .json()
        .catch(() => ({}))) as { error?: string; redirectTo?: string };

      if (response.ok) {
        window.location.assign(data.redirectTo || nextPath || '/');
        return;
      }

      setError(data.error || '登录失败');
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form-wrap">
      <section className="login-card">
        <div className="login-avatar"><img src="/brand/avatar.png" alt="" /></div>
        <p className="eyebrow accent-eyebrow">PRIVATE CONTROL ROOM</p>
        <h2 className="login-title">欢迎回来</h2>
        <p className="login-copy">输入管理员密码，继续整理你的图片。</p>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-[var(--ink)]">
              密码
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="input-surface input-large block w-full px-4 py-3 text-sm placeholder:text-[var(--muted-soft)]"
              placeholder="请输入管理员密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-[rgba(220,38,38,0.24)] bg-[rgba(254,242,242,0.9)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="button-primary button-large w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </div>
  );
}
