import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../services/analyticsService';
import { Loader2, ArrowRight, Sparkles, Mail, Lock, AlertCircle } from 'lucide-react';

interface AuthPageProps {
  onSuccess: () => void;
  isDark: boolean;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess, isDark }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = {
    bg: isDark ? 'bg-zinc-950' : 'bg-slate-50',
    card: isDark ? 'bg-zinc-900' : 'bg-white',
    text: isDark ? 'text-zinc-100' : 'text-slate-900',
    textMuted: isDark ? 'text-zinc-400' : 'text-slate-500',
    border: isDark ? 'border-zinc-800' : 'border-slate-200',
    input: isDark ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'bg-slate-50 border-slate-200 text-slate-900',
    accent: 'text-emerald-500',
    accentBg: 'bg-emerald-500',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        // Check if user session exists (auto-login) or email confirmation needed
        if (data.user && !data.session) {
           setError('账号创建成功！请检查您的邮箱完成验证。');
           setLoading(false);
           return; 
        }
        
        trackEvent('SIGNUP_SUCCESS', { method: 'email' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        trackEvent('LOGIN_SUCCESS', { method: 'email' });
      }
      onSuccess();
    } catch (err: any) {
      console.error("Auth Error Full Details:", err); // ADDED DEBUG LOG
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${theme.bg} flex items-center justify-center p-4 relative overflow-hidden`}>
      {/* Background Ambience */}
      <div className={`absolute inset-0 opacity-20 pointer-events-none`}>
          <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2"></div>
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2"></div>
      </div>

      <div className={`w-full max-w-md ${theme.card} border ${theme.border} rounded-2xl shadow-2xl p-8 relative z-10 animate-fade-up`}>
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${theme.accentBg}/10 ${theme.accent} mb-4`}>
            <Sparkles size={24} />
          </div>
          <h1 className={`text-2xl font-serif-display font-medium ${theme.text} mb-2 tracking-tight`}>
            {isSignUp ? '加入 Vantus' : '欢迎回来'}
          </h1>
          <p className={`text-sm ${theme.textMuted}`}>
            {isSignUp ? '开启您的 AI 增强认知之旅' : '继续您的深度学习探索'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className={`block text-xs font-medium ${theme.textMuted} mb-1.5 uppercase tracking-wider`}>邮箱</label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted}`} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${theme.input}`}
                placeholder="name@example.com"
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.textMuted} mb-1.5 uppercase tracking-wider`}>密码</label>
            <div className="relative">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${theme.textMuted}`} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all ${theme.input}`}
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start space-x-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <span className="text-xs text-red-500">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 rounded-lg font-medium text-sm flex items-center justify-center space-x-2 transition-all ${theme.button} ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>处理中...</span>
              </>
            ) : (
              <>
                <span>{isSignUp ? '创建账户' : '登录'}</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className={`text-xs ${theme.textMuted} hover:${theme.text} transition-colors`}
          >
            {isSignUp ? '已有账号？点此登录' : '还没有账号？点此注册'}
          </button>
        </div>
      </div>
    </div>
  );
};
