import { useCallback, useEffect, useState } from 'react';
import { Game } from './engine/game';
import { loadLlm, type LlmSettings } from './llm/settings';
import { S327 } from './scenarios/s327';
import { EndingScreen } from './ui/EndingScreen';
import { GameScreen } from './ui/GameScreen';
import { SettingsModal, type UiSettings } from './ui/Modals';
import { Setup } from './ui/Setup';
import { Title } from './ui/Title';

type Screen = 'title' | 'setup' | 'game' | 'ending';
const UI_KEY = 'chouma.ui';

function loadUi(): UiSettings {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { colors: 'cn', motion: 'full', mentor: true, ...JSON.parse(raw) };
  } catch {
    /* 无法读取本地存储时使用默认值 */
  }
  return { colors: 'cn', motion: 'full', mentor: true };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [game, setGame] = useState<Game | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [ui, setUiState] = useState<UiSettings>(loadUi);
  const [settings, setSettings] = useState(false);

  const setUi = (u: UiSettings) => {
    setUiState(u);
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(u));
    } catch {
      /* 忽略 */
    }
  };

  useEffect(() => {
    document.documentElement.dataset.colors = ui.colors;
    document.documentElement.dataset.motion = ui.motion;
  }, [ui]);

  const onEnd = useCallback(() => setScreen('ending'), []);

  // 底线：每越过一次，画面就褪去一点颜色
  const lines = game?.linesCrossed ?? 0;
  const filter = screen === 'game' && lines > 0 ? `saturate(${Math.max(0.3, 1 - 0.22 * lines)}) contrast(${1 + 0.04 * lines})` : undefined;

  return (
    <div className="app" style={{ filter }}>
      {screen === 'title' && <Title scenario={S327} onStart={() => setScreen('setup')} onSettings={() => setSettings(true)} />}
      {screen === 'setup' && (
        <Setup
          scenario={S327}
          onBack={() => setScreen('title')}
          onBegin={(f, p, seed) => {
            setGame(new Game(S327, seed, f, p));
            setScreen('game');
          }}
        />
      )}
      {screen === 'game' && game && <GameScreen key={game.seed + game.factionId} game={game} llm={llm} ui={ui} onSettings={() => setSettings(true)} onEnd={onEnd} />}
      {screen === 'ending' && game?.ending && <EndingScreen game={game} onAgain={() => setScreen('setup')} onTitle={() => setScreen('title')} />}
      {settings && <SettingsModal llm={llm} setLlm={setLlm} ui={ui} setUi={setUi} onClose={() => setSettings(false)} />}
    </div>
  );
}
