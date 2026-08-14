'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import styles from './HomeIntroFilmstrip.module.css';

const images = [
  '01_top_left.png',
  '02_top_center.png',
  '03_top_right.png',
  '04_middle_left.png',
  '05_middle_center.png',
  '06_middle_right.png',
  '07_bottom_left.png',
  '08_bottom_center.png',
  '09_bottom_right.png',
  '10_sunlit_white_shirt.png',
  '11_sunlit_linen_shirt.png',
  '12_woman_white_shirt.png',
  '13_woman_ivory_dress.png',
  '14_woman_brown_suit.png',
  '15_sunlit_woman_ivory.png',
  '16_sunlit_man_brown.png',
  '17_black_zip_sweater.png',
  '18_ivory_blazer_woman.png',
  '19_ivory_halter_full_look.png',
  '20_ivory_halter_portrait.png',
] as const;

const sessionKey = 'quick-fashion-filmstrip-intro-v11';

export default function HomeIntroFilmstrip({
  pageReady: _pageReady,
}: {
  pageReady: boolean;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const exitRef = useRef<(() => void) | null>(null);

  const [visible, setVisible] = useState(true);
  const [canSkip, setCanSkip] = useState(false);

  useLayoutEffect(() => {
    const forceIntro = new URLSearchParams(window.location.search).get('intro') === '1';

    if (!forceIntro && sessionStorage.getItem(sessionKey)) {
      setVisible(false);
      router.replace('/design-lab');
    }
  }, [router]);

  useLayoutEffect(() => {
    if (!visible || !rootRef.current || !trackRef.current || !counterRef.current) {
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let finished = false;

    const updateCounter = (progress: number) => {
      const value = Math.min(100, Math.max(0, Math.round(progress * 100)));
      if (!counterRef.current) return;

      counterRef.current.textContent = String(value).padStart(2, '0');
      counterRef.current.parentElement?.setAttribute('aria-valuenow', String(value));
    };

    const finish = () => {
      if (finished) return;
      finished = true;

      const root = rootRef.current;
      if (!root) return;

      gsap.timeline({
        onComplete: () => {
          sessionStorage.setItem(sessionKey, 'seen');
          document.body.style.overflow = previousOverflow;
          setVisible(false);
          router.replace('/design-lab');
        },
      })
        .to(['.qf-film-counter', '.qf-film-topline', '.qf-film-skip'], {
          opacity: 0,
          duration: reducedMotion ? 0.05 : 0.13,
        })
        .to(trackRef.current, {
          xPercent: -9,
          duration: reducedMotion ? 0.06 : 0.2,
          ease: 'power3.in',
        }, '<')
        .to(root, {
          clipPath: 'inset(0 0 100% 0)',
          duration: reducedMotion ? 0.14 : 0.48,
          ease: 'power4.inOut',
        });
    };

    exitRef.current = finish;
    const duration = reducedMotion ? 0.12 : 5;

    const context = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>(`.${styles.panel}`);

      const updatePanelWidths = () => {
        const viewportWidth = window.innerWidth;
        const viewportCenter = viewportWidth / 2;
        const minimumWidth = viewportWidth * (viewportWidth < 700 ? 0.2 : 0.105);
        const maximumWidth = viewportWidth * (viewportWidth < 700 ? 0.72 : 0.46);

        panels.forEach((panel) => {
          const bounds = panel.getBoundingClientRect();
          const panelCenter = bounds.left + bounds.width / 2;
          const distance = Math.abs(panelCenter - viewportCenter);
          const proximity = Math.max(0, 1 - distance / (viewportWidth * 0.62));
          const easedProximity = proximity * proximity * (3 - 2 * proximity);
          const width = minimumWidth + (maximumWidth - minimumWidth) * easedProximity;

          gsap.set(panel, { width });
        });
      };

      updatePanelWidths();

      const startX = window.innerWidth * 1.02;
      gsap.set(trackRef.current, { x: startX, autoAlpha: 1 });

      const lastPanel = panels[panels.length - 1];
      const initialLastRect = lastPanel.getBoundingClientRect();
      const initialTrackX = gsap.getProperty(trackRef.current, 'x') as number;
      const finalX = initialTrackX - initialLastRect.right;
      const totalDistance = initialTrackX - finalX;

      gsap.timeline({
        onComplete: () => {
          updateCounter(1);
          finish();
        },
      }).to(trackRef.current, {
        x: finalX,
        duration,
        ease: 'none',
        onUpdate() {
          updatePanelWidths();

          const currentX = gsap.getProperty(trackRef.current!, 'x') as number;
          const progress = (initialTrackX - currentX) / totalDistance;
          updateCounter(progress);
        },
      }, 0);
    }, rootRef);

    const skipTimer = window.setTimeout(() => setCanSkip(true), 600);

    return () => {
      context.revert();
      window.clearTimeout(skipTimer);
      document.body.style.overflow = previousOverflow;
      exitRef.current = null;
    };
  }, [router, visible]);

  if (!visible) return null;

  return (
    <div ref={rootRef} className={styles.preloader} aria-label="Preparing Quick Fashion">
      <div ref={trackRef} className={styles.track} aria-hidden="true">
        {images.map((name) => (
          <figure className={styles.panel} key={name}>
            <img className={styles.image} src={`/preloader/${name}`} alt="" draggable={false} />
          </figure>
        ))}
      </div>

      <div className={styles.grain} />

      <p className={`${styles.topline} qf-film-topline`}>
        Quick Fashion · Moving Index
      </p>

      <div
        className={`${styles.counterWrap} qf-film-counter`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
      >
        <span ref={counterRef} className={styles.counter}>00</span>
        <span className={styles.percent}>%</span>
      </div>

      {canSkip && (
        <button
          className={`${styles.skip} qf-film-skip`}
          type="button"
          onClick={() => exitRef.current?.()}
        >
          Skip intro
        </button>
      )}
    </div>
  );
}