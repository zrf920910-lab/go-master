import { useEffect, useState } from 'react';
import { KataGoProvider, type KataGoConfig, type KataGoTransport } from '../../ai/katago';
import type { AnalysisResult } from '../../ai/types';
import type { GoBoard } from '../../engine/GoBoard/GoBoard';
import type { Color } from '../../engine/GoBoard/types';
import { MoveSuggestionList, WinrateBar } from './TeacherPanel';
import './teacher.css';

/**
 * KataGo connection panel.
 *
 * There is no bundled engine: a browser build of KataGo needs a WASM/WebGPU
 * binary and a 10–95 MB network, which this app does not ship. Instead this
 * panel lets the user point at their own `katago analysis` / GTP bridge, proves
 * the connection with a real request, and shows the real numbers that come
 * back. If it is not configured, it says so instead of pretending.
 */

const STORAGE = 'gomaster.katago.config';

export function loadKataGoConfig(): KataGoConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as KataGoConfig) : null;
  } catch {
    return null;
  }
}

export function saveKataGoConfig(cfg: KataGoConfig | null) {
  if (!cfg) localStorage.removeItem(STORAGE);
  else localStorage.setItem(STORAGE, JSON.stringify(cfg));
}

export function KataGoPanel({
  board,
  color,
  onPlay,
}: {
  board: GoBoard;
  color: Color;
  onPlay?: (i: number) => void;
}) {
  const [cfg, setCfg] = useState<KataGoConfig | null>(() => loadKataGoConfig());
  const [endpoint, setEndpoint] = useState(cfg?.endpoint ?? '');
  const [token, setToken] = useState(cfg?.token ?? '');
  const [transport, setTransport] = useState<KataGoTransport>(cfg?.transport ?? 'analysis');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysing, setAnalysing] = useState(false);

  useEffect(() => {
    if (cfg?.endpoint) {
      setEndpoint(cfg.endpoint);
      setToken(cfg.token ?? '');
      setTransport(cfg.transport);
    }
  }, [cfg]);

  const probe = async () => {
    const next: KataGoConfig = { transport, endpoint: endpoint.trim(), token: token.trim() || undefined, level: 5 };
    setChecking(true);
    setStatus(null);
    try {
      const provider = new KataGoProvider(next);
      const health = await provider.healthCheck();
      setStatus({ ok: health.ok, text: health.ok ? '连接成功，可以分析' : `连接失败：${health.detail ?? '未知原因'}` });
      if (health.ok) {
        saveKataGoConfig(next);
        setCfg(next);
      }
    } catch (err) {
      setStatus({ ok: false, text: `连接失败：${(err as Error).message}` });
    } finally {
      setChecking(false);
    }
  };

  const runAnalysis = async () => {
    if (!cfg) return;
    setAnalysing(true);
    setStatus(null);
    try {
      const provider = new KataGoProvider(cfg);
      const result = await provider.analyze({ board, color, maxMoves: 5, budgetMs: 15000 });
      setAnalysis(result);
      setStatus({ ok: true, text: `分析完成（${result.elapsedMs.toFixed(0)} ms）` });
    } catch (err) {
      setStatus({ ok: false, text: `分析失败：${(err as Error).message}` });
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <section className="teacher katago">
      <header className="teacher__head">
        <h2 className="h3">
          <span aria-hidden>⚙️</span> KataGo 高级 AI
        </h2>
        <span className={`chip ${cfg ? 'chip--green' : ''}`}>{cfg ? '已连接' : '未配置'}</span>
      </header>

      <p className="tiny mute-2" style={{ lineHeight: 1.6 }}>
        本项目不内置 KataGo（浏览器版需要 WASM/WebGPU 构建 + 10–95 MB 神经网络）。填写你自己搭建的
        <b> analysis / GTP 服务</b>地址即可使用真实 KataGo 的胜率与推荐落子。
      </p>

      <div className="field">
        <span className="field__label">协议</span>
        <div className="segmented">
          <button
            className={`segmented__item ${transport === 'analysis' ? 'segmented__item--on' : ''}`}
            onClick={() => setTransport('analysis')}
          >
            analysis
          </button>
          <button
            className={`segmented__item ${transport === 'gtp' ? 'segmented__item--on' : ''}`}
            onClick={() => setTransport('gtp')}
          >
            GTP (kata-analyze)
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field__label">服务地址</span>
        <input
          className="input"
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder={transport === 'analysis' ? 'https://my-box.example/katago' : 'wss://my-box.example/gtp'}
          inputMode="url"
          aria-label="KataGo 服务地址"
        />
      </label>
      <label className="field">
        <span className="field__label">访问令牌（可选）</span>
        <input
          className="input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Bearer token"
          aria-label="KataGo 访问令牌"
        />
      </label>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn--sm grow" onClick={probe} disabled={!endpoint.trim() || checking}>
          {checking ? '检测中…' : '检测连接'}
        </button>
        <button className="btn btn--sm btn--primary grow" onClick={runAnalysis} disabled={!cfg || analysing}>
          {analysing ? '分析中…' : '分析当前局面'}
        </button>
      </div>

      {status && (
        <p className={`tiny ${status.ok ? 'ok' : 'no'}`} role="status">
          {status.text}
        </p>
      )}

      {analysis && (
        <div className="katago__result">
          {analysis.rootWinrate !== undefined && (
            <WinrateBar value={analysis.rootWinrate} label={`当前方胜率 ${Math.round(analysis.rootWinrate * 100)}%`} />
          )}
          <MoveSuggestionList moves={analysis.moves} size={board.size} onPlay={onPlay} />
          <p className="tiny mute-2">数据来自 {analysis.provider}，访问次数以引擎返回为准。</p>
        </div>
      )}
    </section>
  );
}
