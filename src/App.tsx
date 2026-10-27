import { useCallback, useEffect, useState } from 'react';
import { Game } from './engine/game';
import { loadLlm, type LlmSettings } from './llm/settings';
import type { Scenario } from './engine/game';
import { GME } from './scenarios/gme';
import { S327 } from './scenarios/s327';
import { EndingScreen } from './ui/EndingScreen';
import { GameScreen } from './ui/GameScreen';
import { SettingsModal, type UiSettings } from './ui/Modals';
import { Setup } from './ui/Setup';
import { clearSave, loadSave, restore, type SaveData } from './ui/save';
import { Title } from './ui/Title';
import { TulipScreen, TulipSetup } from './ui/TulipScreen';
import { TulipGame } from './scenarios/tulip/game';

const SCENARIOS: Record<string, Scenario> = { s327: S327, gme2021: GME };

type Screen = 'title' | 'setup' | 'game' | 'ending' | 'tulip-setup' | 'tulip';
const UI_KEY = 'chouma.ui';
const UI_DEFAULT: UiSettings = { colors: 'cn', motion: 'full', mentor: true, sound: true };

function loadUi(): UiSettings {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...UI_DEFAULT, ...JSON.parse(raw) };
  } catch {
    /* 无法读取本地存储时使用默认值 */
  }
  return { ...UI_DEFAULT };
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('title');
  const [game, setGame] = useState<Game | null>(null);
  const [llm, setLlm] = useState<LlmSettings>(loadLlm);
  const [ui, setUiState] = useState<UiSettings>(loadUi);
  const [settings, setSettings] = useState(false);
  const [save, setSave] = useState<SaveData | null>(loadSave);
  const [tulip, setTulip] = useState<TulipGame | null>(null);
  const [scenario, setScenario] = useState<Scenario>(S327);

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

  const onEnd = useCallback(() => {
    clearSave();
    setSave(null);
    setScreen('ending');
  }, []);

  // 底线：每越过一次，画面就褪去一点颜色
  const lines = game?.linesCrossed ?? 0;
  const filter = screen === 'game' && lines > 0 ? `saturate(${Math.max(0.3, 1 - 0.22 * lines)}) contrast(${1 + 0.04 * lines})` : undefined;

  return (
    <div className="app" style={{ filter }}>
      {screen === 'title' && (
        <Title
          scenario={S327}
          save={save}
          onStart={(which) => {
            if (which === 'tulip') setScreen('tulip-setup');
            else {
              setScenario(SCENARIOS[which]);
              setScreen('setup');
            }
          }}
          onContinue={() => {
            if (!save) return;
            try {
              setGame(restore(SCENARIOS[save.scenario] ?? S327, save));
              setScreen('game');
            } catch {
              clearSave();
              setSave(null);
            }
          }}
          onSettings={() => setSettings(true)}
        />
      )}
      {screen === 'tulip-setup' && (
        <TulipSetup
          onBack={() => setScreen('title')}
          onBegin={(f) => {
            setTulip(new TulipGame(Math.random().toString(36).slice(2, 8), f));
            setScreen('tulip');
            window.scrollTo({ top: 0 });
          }}
        />
      )}
      {screen === 'tulip' && tulip && (
        <TulipScreen
          key={tulip.seed}
          game={tulip}
          llm={llm}
          onExit={() => setScreen('title')}
          onTo327={() => {
            setScenario(S327);
            setScreen('setup');
          }}
        />
      )}
      {screen === 'setup' && (
        <Setup
          key={scenario.id}
          scenario={scenario}
          onBack={() => setScreen('title')}
          onBegin={(f, p, seed) => {
            setGame(new Game(scenario, seed, f, p));
            setScreen('game');
          }}
        />
      )}
      {screen === 'game' && game && <GameScreen key={game.scenario.id + game.seed + game.factionId} game={game} llm={llm} ui={ui} onSettings={() => setSettings(true)} onEnd={onEnd} />}
      {screen === 'ending' && game?.ending && (
        <EndingScreen
          game={game}
          onAgain={() => setScreen('setup')}
          onTitle={() => {
            setSave(loadSave());
            setScreen('title');
          }}
        />
      )}
      {settings && <SettingsModal llm={llm} setLlm={setLlm} ui={ui} setUi={setUi} onClose={() => setSettings(false)} />}
    </div>
  );
}
