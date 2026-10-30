import { useCallback, useEffect, useState } from 'react';
import { Game } from './engine/game';
import { loadLlm, type LlmSettings } from './llm/settings';
import type { Scenario } from './engine/game';
import { GME } from './scenarios/gme';
import { TAKEOVER } from './scenarios/takeover';
import { S327 } from './scenarios/s327';
import { EndingScreen } from './ui/EndingScreen';
import { GameScreen } from './ui/GameScreen';
import { SettingsModal, type UiSettings } from './ui/Modals';
import { markPlayed, Setup } from './ui/Setup';
import { CareerScreen } from './ui/CareerScreen';
import { chapter1, chapter2, loadCareer, recordChapter, saveCareer, type Career } from './career/career';
import { clearSave, loadSave, restore, restoreTulip, type SaveData } from './ui/save';
import { Title } from './ui/Title';
import { TulipScreen, TulipSetup } from './ui/TulipScreen';
import { TulipGame } from './scenarios/tulip/game';

const SCENARIOS: Record<string, Scenario> = { s327: S327, gme2021: GME, takeover2015: TAKEOVER };

type Screen = 'title' | 'setup' | 'game' | 'ending' | 'tulip-setup' | 'tulip' | 'career';
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
  const [career, setCareerState] = useState<Career | null>(loadCareer);
  const setCareer = (c: Career | null) => {
    setCareerState(c);
    saveCareer(c);
  };
  /** 开始生涯里的下一章 */
  const playChapter = () => {
    if (!career) return;
    const ch = career.step === 'ch1' ? chapter1() : career.step === 'ch2' ? chapter2(career) : null;
    if (!ch) return;
    const g = new Game(SCENARIOS[ch.scenario], career.seed, ch.seat, career.principle, ch.opts);
    g.difficulty = career.difficulty;
    setGame(g);
    setScreen('game');
  };

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
    markPlayed();
    clearSave();
    setSave(null);
    // 生涯里的一章打完：结果记进履历（按步骤核对，只记一次）
    const c = loadCareer();
    if (game?.ending && game.setupOpts.career && c && ((c.step === 'ch1' && game.scenario.id === 's327') || (c.step === 'ch2' && game.scenario.id === 'gme2021'))) {
      const n = recordChapter(c, game);
      saveCareer(n);
      setCareerState(n);
    }
    setScreen('ending');
  }, [game]);

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
            if (save.scenario === 'tulip') {
              setTulip(restoreTulip(save));
              setScreen('tulip');
              return;
            }
            try {
              setGame(restore(SCENARIOS[save.scenario] ?? S327, save));
              setScreen('game');
            } catch {
              clearSave();
              setSave(null);
            }
          }}
          onSettings={() => setSettings(true)}
          onCareer={() => setScreen('career')}
          careerLabel={career ? { ch1: '1995 年', interlude: `${career.events[career.events.length - 1]?.year ?? '1995'} 年`, ch2: '2021 年', done: '传记' }[career.step] : undefined}
        />
      )}
      {screen === 'career' && (
        <CareerScreen
          career={career}
          onChange={setCareer}
          onPlay={playChapter}
          onTitle={() => setScreen('title')}
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
          onExit={() => {
            setSave(loadSave());
            setScreen('title');
          }}
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
          onBegin={(f, p, seed, difficulty, startDay) => {
            const g = new Game(scenario, seed, f, p, startDay ? { startDay } : undefined);
            g.difficulty = difficulty;
            setGame(g);
            setScreen('game');
          }}
        />
      )}
      {screen === 'game' && game && (
        <GameScreen key={game.scenario.id + game.seed + game.factionId + game.undos} game={game} llm={llm} ui={ui} onSettings={() => setSettings(true)} onEnd={onEnd} onReplace={setGame} />
      )}
      {screen === 'ending' && game?.ending && (
        <EndingScreen
          game={game}
          againLabel={game.setupOpts.career ? '继续生涯 →' : undefined}
          onAgain={() => setScreen(game.setupOpts.career ? 'career' : 'setup')}
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
