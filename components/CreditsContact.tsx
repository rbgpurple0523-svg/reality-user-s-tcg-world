'use client';

import React, { useEffect, useState } from 'react';
import {
  getAudioSettings,
  setBgmEnabled,
  setSeEnabled,
  subscribeAudioSettings,
} from './audio';

const CONTACT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeoPq6m3Z09DP9jbSDQm-AV9jKp1PuD1lqGGU4Qm2lGZ8ikJg/viewform?usp=publish-editor';

export default function CreditsContact() {
  const [open, setOpen] = useState(false);
  const [bgmEnabled, setBgmEnabledState] = useState(true);
  const [seEnabled, setSeEnabledState] = useState(true);

  useEffect(() => {
    const syncSettings = () => {
      const settings = getAudioSettings();
      setBgmEnabledState(settings.bgmEnabled);
      setSeEnabledState(settings.seEnabled);
    };

    syncSettings();
    return subscribeAudioSettings(syncSettings);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-silent-se="true"
        onClick={() => setOpen(true)}
        aria-label="設定・クレジット・お問い合わせ"
        className="fixed bottom-3 left-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white/95 text-sm font-black text-gray-600 shadow-lg backdrop-blur-sm transition hover:bg-white hover:text-gray-900"
      >
        i
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-credits-title"
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black tracking-[0.24em] text-indigo-500">
                  SETTINGS &amp; CREDITS
                </div>
                <h2 id="settings-credits-title" className="mt-1 text-xl font-black text-gray-950">
                  設定・クレジット
                </h2>
              </div>
              <button
                type="button"
                data-silent-se="true"
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="rounded-full bg-gray-100 px-3 py-2 text-sm font-black text-gray-600 hover:bg-gray-200"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-7 text-sm">
              <section>
                <h3 className="text-xs font-black tracking-[0.2em] text-gray-500">SOUND</h3>
                <div className="mt-3 space-y-3">
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-gray-800">BGM</span>
                      <div className="grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-gray-200">
                        <button
                          type="button"
                          data-silent-se="true"
                          onClick={() => setBgmEnabled(true)}
                          className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${bgmEnabled ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          ON
                        </button>
                        <button
                          type="button"
                          data-silent-se="true"
                          onClick={() => setBgmEnabled(false)}
                          className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${!bgmEnabled ? 'bg-gray-800 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          OFF
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-gray-800">SE</span>
                      <div className="grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-gray-200">
                        <button
                          type="button"
                          data-silent-se="true"
                          onClick={() => setSeEnabled(true)}
                          className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${seEnabled ? 'bg-indigo-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          ON
                        </button>
                        <button
                          type="button"
                          data-silent-se="true"
                          onClick={() => setSeEnabled(false)}
                          className={`rounded-lg px-4 py-2 text-[10px] font-black transition ${!seEnabled ? 'bg-gray-800 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                          OFF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-black tracking-[0.2em] text-gray-500">CREDITS</h3>
                <div className="mt-3 space-y-2.5 leading-6 text-gray-700">
                  <p>
                    BGM：フリーBGM・音楽素材MusMus{' '}
                    <a
                      href="https://musmus.main.jp"
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-indigo-600 underline underline-offset-2"
                    >
                      https://musmus.main.jp
                    </a>
                  </p>
                  <p>
                    SE：効果音ラボ{' '}
                    <a
                      href="https://soundeffect-lab.info/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-indigo-600 underline underline-offset-2"
                    >
                      https://soundeffect-lab.info/
                    </a>
                  </p>
                  <p>
                    サンプルキャラ画像：いらすとや{' '}
                    <a
                      href="https://www.irasutoya.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold text-indigo-600 underline underline-offset-2"
                    >
                      https://www.irasutoya.com/
                    </a>
                  </p>
                  <p className="pt-1 font-black text-gray-900">制作　ぱーーぷる</p>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-black tracking-[0.2em] text-gray-500">CONTACT</h3>
                <div className="mt-3 leading-6 text-gray-700">
                  <p>お問い合わせ</p>
                  <a
                    href={CONTACT_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700"
                  >
                    こちらのフォームから
                  </a>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
