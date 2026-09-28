export type BgmSection = 'home' | 'feather' | 'aurora' | 'star' | 'result';
export type SeKey =
  | 'decision'
  | 'supportStatBoost'
  | 'supportOther'
  | 'skill123'
  | 'skill4';

type AudioSettings = {
  bgmEnabled: boolean;
  seEnabled: boolean;
};

const AUDIO_SETTINGS_KEY = 'reality_tcg_audio_settings';
const AUDIO_SETTINGS_EVENT = 'reality-tcg-audio-settings-change';

const BGM_TRACKS: Record<BgmSection, string[]> = {
  home: [
    'MusMus-BGM-174.mp3',
    'MusMus-BGM-154.mp3',
    'MusMus-BGM-087.mp3',
    'MusMus-BGM-066.mp3',
    'MusMus-BGM-014.mp3',
  ],
  feather: ['MusMus-BGM-034.mp3', 'MusMus-BGM-071.mp3'],
  aurora: ['MusMus-BGM-172.mp3', 'MusMus-BGM-011.mp3'],
  star: ['MusMus-BGM-192.mp3', 'MusMus-BGM-113.mp3', 'MusMus-BGM-061.mp3'],
  result: ['MusMus-BGM-CP03.mp3'],
};

const SE_FILES: Record<SeKey, string> = {
  decision: '決定ボタンを押す34.mp3',
  supportStatBoost: 'ステータス上昇魔法2.mp3',
  supportOther: 'ニュースタイトル表示3.mp3',
  skill123: '可愛く輝く1.mp3',
  skill4: 'きらーん2.mp3',
};

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  bgmEnabled: true,
  seEnabled: true,
};

let currentBgm: HTMLAudioElement | null = null;
let currentBgmSection: BgmSection | null = null;
let requestedBgmSection: BgmSection | null = null;
let lastPickedTrack: Partial<Record<BgmSection, string>> = {};
let bgmFadeTimer: number | null = null;
let bgmTransitionId = 0;
let fadingOutBgm: HTMLAudioElement | null = null;

const BGM_VOLUME = 0.3;
const BGM_FADE_MS = 450;

function readAudioSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS;

  try {
    const saved = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!saved) return DEFAULT_AUDIO_SETTINGS;
    const parsed = JSON.parse(saved) as Partial<AudioSettings>;
    return {
      bgmEnabled: parsed.bgmEnabled !== false,
      seEnabled: parsed.seEnabled !== false,
    };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

function writeAudioSettings(next: AudioSettings) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Keep the in-memory state working even if persistence is unavailable.
  }

  window.dispatchEvent(new Event(AUDIO_SETTINGS_EVENT));
}

export function getAudioSettings(): AudioSettings {
  return readAudioSettings();
}

export function subscribeAudioSettings(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const handleChange = () => listener();
  window.addEventListener(AUDIO_SETTINGS_EVENT, handleChange);
  return () => window.removeEventListener(AUDIO_SETTINGS_EVENT, handleChange);
}

function clearBgmFade() {
  if (bgmFadeTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(bgmFadeTimer);
    bgmFadeTimer = null;
  }
}

function fadeAudio(audio: HTMLAudioElement, from: number, to: number, duration: number, transitionId: number, onComplete?: () => void) {
  if (typeof window === 'undefined') return;

  audio.volume = from;
  const start = performance.now();
  const finish = () => {
    audio.volume = to;
    onComplete?.();
  };

  bgmFadeTimer = window.setInterval(() => {
    if (transitionId !== bgmTransitionId) {
      clearBgmFade();
      return;
    }

    const progress = Math.min(1, (performance.now() - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = from + (to - from) * eased;

    if (progress >= 1) {
      clearBgmFade();
      finish();
    }
  }, 20);
}

export function setBgmEnabled(enabled: boolean) {
  const current = readAudioSettings();
  writeAudioSettings({ ...current, bgmEnabled: enabled });

  if (!enabled) {
    bgmTransitionId += 1;
    clearBgmFade();

    if (fadingOutBgm && fadingOutBgm !== currentBgm) {
      fadingOutBgm.pause();
      fadingOutBgm.currentTime = 0;
    }
    fadingOutBgm = null;

    currentBgm?.pause();
    currentBgm = null;
    currentBgmSection = null;
    return;
  }

  if (requestedBgmSection) {
    playBgm(requestedBgmSection);
  }
}

export function setSeEnabled(enabled: boolean) {
  const current = readAudioSettings();
  writeAudioSettings({ ...current, seEnabled: enabled });
}

function getAudioPath(kind: 'bgm' | 'se', ...parts: string[]) {
  return `/audio/${kind}/${parts.map((part) => encodeURIComponent(part)).join('/')}`;
}

function pickTrack(section: BgmSection) {
  const tracks = BGM_TRACKS[section];
  const previous = lastPickedTrack[section];
  const candidates = tracks.length > 1 ? tracks.filter((track) => track !== previous) : tracks;
  const track = candidates[Math.floor(Math.random() * candidates.length)] ?? tracks[0];
  lastPickedTrack = { ...lastPickedTrack, [section]: track };
  return track;
}

export function playBgm(section: BgmSection) {
  if (typeof window === 'undefined') return;

  requestedBgmSection = section;

  if (!readAudioSettings().bgmEnabled) {
    return;
  }

  if (currentBgmSection === section && currentBgm) {
    void currentBgm.play().catch(() => undefined);
    return;
  }

  const transitionId = ++bgmTransitionId;
  clearBgmFade();

  if (fadingOutBgm && fadingOutBgm !== currentBgm) {
    fadingOutBgm.pause();
    fadingOutBgm.currentTime = 0;
  }
  fadingOutBgm = null;

  const previousBgm = currentBgm;
  const previousVolume = previousBgm?.volume ?? 0;
  const track = pickTrack(section);
  const audio = new Audio(getAudioPath('bgm', section, track));
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = previousBgm ? 0 : BGM_VOLUME;

  currentBgm = audio;
  currentBgmSection = section;

  void audio.play().catch(() => undefined);

  if (!previousBgm) {
    fadeAudio(audio, 0, BGM_VOLUME, BGM_FADE_MS, transitionId);
    return;
  }

  fadingOutBgm = previousBgm;
  const startedAt = performance.now();
  bgmFadeTimer = window.setInterval(() => {
    if (transitionId !== bgmTransitionId) {
      clearBgmFade();
      return;
    }

    const progress = Math.min(1, (performance.now() - startedAt) / BGM_FADE_MS);
    const eased = 1 - Math.pow(1 - progress, 3);

    previousBgm.volume = Math.max(0, previousVolume * (1 - eased));
    audio.volume = BGM_VOLUME * eased;

    if (progress >= 1) {
      clearBgmFade();
      previousBgm.pause();
      previousBgm.currentTime = 0;
      previousBgm.volume = previousVolume;
      if (fadingOutBgm === previousBgm) {
        fadingOutBgm = null;
      }
      audio.volume = BGM_VOLUME;
    }
  }, 20);
}

export function stopBgm() {
  bgmTransitionId += 1;
  clearBgmFade();

  const audio = currentBgm;
  if (fadingOutBgm && fadingOutBgm !== audio) {
    fadingOutBgm.pause();
    fadingOutBgm.currentTime = 0;
    fadingOutBgm = null;
  }

  if (!audio) {
    currentBgmSection = null;
    return;
  }

  const transitionId = bgmTransitionId;
  const fromVolume = audio.volume;
  const startedAt = performance.now();
  bgmFadeTimer = window.setInterval(() => {
    if (transitionId !== bgmTransitionId) {
      clearBgmFade();
      return;
    }

    const progress = Math.min(1, (performance.now() - startedAt) / BGM_FADE_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    audio.volume = Math.max(0, fromVolume * (1 - eased));

    if (progress >= 1) {
      clearBgmFade();
      audio.pause();
      audio.currentTime = 0;
      if (currentBgm === audio) {
        currentBgm = null;
        currentBgmSection = null;
      }
      if (fadingOutBgm === audio) {
        fadingOutBgm = null;
      }
    }
  }, 20);
}

export function playSe(key: SeKey) {
  if (typeof window === 'undefined') return;
  if (!readAudioSettings().seEnabled) return;

  const pathParts =
    key === 'decision'
      ? ['home', SE_FILES[key]]
      : key === 'supportStatBoost' || key === 'supportOther'
        ? ['battle', 'support', SE_FILES[key]]
        : ['battle', 'skill', SE_FILES[key]];
  const audio = new Audio(getAudioPath('se', ...pathParts));
  audio.preload = 'auto';
  audio.volume = 0.00;
  void audio.play().catch(() => undefined);
}
