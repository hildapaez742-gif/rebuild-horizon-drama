'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface EngineConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface AppConfig {
  activeEngine: 'claude' | 'qwen';
  userName: string;
  engines: {
    claude: EngineConfig;
    qwen: EngineConfig;
  };
}

const DEFAULT_CONFIG: AppConfig = {
  activeEngine: 'claude',
  userName: '',
  engines: {
    claude: { apiKey: '', model: 'claude-sonnet-4-6', baseUrl: '' },
    qwen: { apiKey: '', model: 'qwen-plus', baseUrl: '' },
  },
};

const CLAUDE_MODELS = [
  { value: 'claude-opus-4-6', label: 'claude-opus-4-6' },
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (推荐)' },
  { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
];

const QWEN_MODELS = [
  { value: 'qwen-max', label: 'qwen-max' },
  { value: 'qwen-plus', label: 'qwen-plus' },
  { value: 'qwen-turbo', label: 'qwen-turbo' },
];

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [newApiKey, setNewApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('drama-settings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as AppConfig;
        setConfig(parsed);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const showToast = useCallback((message: string, type: Toast['type']) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const activeModels = config.activeEngine === 'claude' ? CLAUDE_MODELS : QWEN_MODELS;
  const activeEngineConfig = config.engines[config.activeEngine];

  const updateActiveEngine = (field: keyof EngineConfig, value: string) => {
    setConfig((prev) => ({
      ...prev,
      engines: {
        ...prev.engines,
        [prev.activeEngine]: {
          ...prev.engines[prev.activeEngine],
          [field]: value,
        },
      },
    }));
  };

  const switchEngine = (engine: 'claude' | 'qwen') => {
    setConfig((prev) => ({ ...prev, activeEngine: engine }));
    setNewApiKey('');
    setShowApiKey(false);
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const toSave = { ...config };
      if (newApiKey.trim()) {
        toSave.engines = {
          ...toSave.engines,
          [toSave.activeEngine]: {
            ...toSave.engines[toSave.activeEngine],
            apiKey: newApiKey.trim(),
          },
        };
      }
      localStorage.setItem('drama-settings', JSON.stringify(toSave));
      setConfig(toSave);
      setNewApiKey('');
      showToast('配置已保存', 'success');
    } catch {
      showToast('保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    const engineConfig = { ...activeEngineConfig };
    if (newApiKey.trim()) {
      engineConfig.apiKey = newApiKey.trim();
    }

    if (!engineConfig.apiKey) {
      showToast('请先填写 API Key', 'error');
      return;
    }

    setTesting(true);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: config.activeEngine, config: engineConfig }),
      });

      if (res.ok) {
        showToast('连接成功', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || '连接失败', 'error');
      }
    } catch {
      showToast('网络错误，无法测试连接', 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-[#E8E8F0]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-lg shadow-2xl text-sm font-medium transition-all duration-300 border ${
            toast.type === 'success'
              ? 'bg-[#2DD4A0]/15 border-[#2DD4A0]/40 text-[#2DD4A0]'
              : toast.type === 'error'
                ? 'bg-[#FF4D6D]/15 border-[#FF4D6D]/40 text-[#FF4D6D]'
                : 'bg-[#3D7EFF]/15 border-[#3D7EFF]/40 text-[#3D7EFF]'
          }`}
        >
          {toast.type === 'success' && '✓ '}
          {toast.type === 'error' && '✗ '}
          {toast.message}
        </div>
      )}

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Back link */}
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-[#6B6B8A] hover:text-[#C8A96E] transition-colors text-sm mb-8"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          返回项目列表
        </Link>

        {/* Title */}
        <h1 className="text-3xl font-serif font-bold text-[#E8E8F0] mb-10">
          设置
        </h1>

        {/* AI Engine Section */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-[#E8E8F0] mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-[#C8A96E] rounded-full inline-block" />
            AI 引擎配置
          </h2>

          <div className="grid grid-cols-2 gap-4 mb-8">
            {/* Claude Card */}
            <button
              type="button"
              onClick={() => switchEngine('claude')}
              className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                config.activeEngine === 'claude'
                  ? 'border-[#C8A96E] bg-[#12121A] shadow-[0_0_20px_rgba(200,169,110,0.1)]'
                  : 'border-[#1E1E2E] bg-[#12121A] hover:border-[#2a2a3e]'
              }`}
            >
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-semibold text-[#E8E8F0] text-sm">
                Anthropic Claude
              </div>
              {config.activeEngine === 'claude' && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#2DD4A0] rounded-full animate-pulse" />
                  <span className="text-[#2DD4A0] text-xs">当前使用</span>
                </div>
              )}
            </button>

            {/* Qwen Card */}
            <button
              type="button"
              onClick={() => switchEngine('qwen')}
              className={`relative p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                config.activeEngine === 'qwen'
                  ? 'border-[#C8A96E] bg-[#12121A] shadow-[0_0_20px_rgba(200,169,110,0.1)]'
                  : 'border-[#1E1E2E] bg-[#12121A] hover:border-[#2a2a3e]'
              }`}
            >
              <div className="text-2xl mb-2">🌞</div>
              <div className="font-semibold text-[#E8E8F0] text-sm">
                阿里云千问
              </div>
              {config.activeEngine === 'qwen' && (
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-[#2DD4A0] rounded-full animate-pulse" />
                  <span className="text-[#2DD4A0] text-xs">当前使用</span>
                </div>
              )}
            </button>
          </div>

          {/* API Key */}
          <div className="space-y-5">
            <div>
              <label className="block text-sm text-[#6B6B8A] mb-2">
                更换 API Key（留空保持不变）
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={
                    activeEngineConfig.apiKey
                      ? '已配置，留空保持不变'
                      : '请输入 API Key'
                  }
                  className="w-full bg-[#12121A] border border-[#1E1E2E] rounded-lg px-4 py-3 text-sm text-[#E8E8F0] placeholder-[#6B6B8A]/50 focus:outline-none focus:border-[#C8A96E] transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B6B8A] hover:text-[#E8E8F0] transition-colors text-xs px-2 py-1 rounded"
                >
                  {showApiKey ? '隐藏' : '显示'}
                </button>
              </div>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm text-[#6B6B8A] mb-2">模型</label>
              <select
                value={activeEngineConfig.model}
                onChange={(e) => updateActiveEngine('model', e.target.value)}
                className="w-full bg-[#12121A] border border-[#1E1E2E] rounded-lg px-4 py-3 text-sm text-[#E8E8F0] focus:outline-none focus:border-[#C8A96E] transition-colors appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B6B8A'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  backgroundSize: '16px',
                }}
              >
                {activeModels.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Base URL */}
            <div>
              <label className="block text-sm text-[#6B6B8A] mb-2">
                Base URL（中转地址，直连留空）
              </label>
              <input
                type="text"
                value={activeEngineConfig.baseUrl}
                onChange={(e) => updateActiveEngine('baseUrl', e.target.value)}
                placeholder="https://api.example.com/v1"
                className="w-full bg-[#12121A] border border-[#1E1E2E] rounded-lg px-4 py-3 text-sm text-[#E8E8F0] placeholder-[#6B6B8A]/50 focus:outline-none focus:border-[#C8A96E] transition-colors"
              />
            </div>

            {/* User Name */}
            <div>
              <label className="block text-sm text-[#6B6B8A] mb-2">
                我的名字（团队成员标识）
              </label>
              <input
                type="text"
                value={config.userName}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, userName: e.target.value }))
                }
                placeholder="例如：张三"
                className="w-full bg-[#12121A] border border-[#1E1E2E] rounded-lg px-4 py-3 text-sm text-[#E8E8F0] placeholder-[#6B6B8A]/50 focus:outline-none focus:border-[#C8A96E] transition-colors"
              />
            </div>
          </div>
        </section>

        {/* Buttons */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-[#C8A96E] hover:bg-[#b8994e] text-[#0A0A0F] font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '💾 保存配置'}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="px-6 py-3 border border-[#C8A96E] text-[#C8A96E] hover:bg-[#C8A96E]/10 font-semibold text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? '测试中...' : '🔗 测试连接'}
          </button>
        </div>
      </div>
    </div>
  );
}
