'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import styles from './HomePreloader.module.css';

const rows = [
  ['01_top_left.png', '02_top_center.png', '03_top_right.png'],
  ['04_middle_left.png', '05_middle_center.png', '06_middle_right.png'],
  ['07_bottom_left.png', '08_bottom_center.png', '09_bottom_right.png'],
] as const;

const sessionKey = 'quick-fashion-filmstrip-intro-v2';

export default function HomePreloader({ pageReady: _pageReady }: { pageReady: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<(() => void) | null>(null);
  const [visible, setVisible] = useState(true);
  const [canSkip, setCanSkip] = useState(false);

  useLayoutEffect(() => {
    const forceIntro = new URLSearchParams(window.location.search).get('intro') === '1';
    if (!forceIntro && sessionStorage.getItem(sessionKey)) setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible || !rootRef.current || !counterRef.current) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const counter = { value: 0 };
    let finished = false;

    const updateCounter = () => {
      const value = Math.round(counter.value);
      if (counterRef.current) {
        counterRef.current.textContent = String(value).padStart(2, '0');
        counterRef.current.parentElement?.setAttribute('aria-valuenow', String(value));
      }
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
        },
      })
        .to(['.qf-preloader-counter-wrap', '.qf-preloader-topline', '.qf-preloader-skip'], { opacity: 0, duration: reducedMotion ? .08 : .16 })
        .to(washRef.current, { opacity: 1, duration: reducedMotion ? .08 : .24, ease: 'power2.inOut' }, '-=.06')
        .to(wordmarkRef.current, { opacity: 1, yPercent: -10, duration: reducedMotion ? .08 : .26, ease: 'power3.out' }, '-=.13')
        .to(root, { clipPath: 'inset(0 0 100% 0)', duration: reducedMotion ? .15 : .58, ease: 'power4.inOut' }, '+=.1');
    };

    exitRef.current = finish;
    const duration = reducedMotion ? .15 : 2.15;
    const context = gsap.context(() => {
      gsap.to(counter, { value: 100, duration, ease: 'none', onUpdate: updateCounter, onComplete: finish });
      gsap.utils.toArray<HTMLElement>(`.${styles.rowTrack}`).forEach((track, index) => {
        gsap.fromTo(track, { xPercent: index % 2 === 0 ? 0 : -6 }, {
          xPercent: index % 2 === 0 ? -48 : -58,
          duration: duration + .16,
          ease: 'none',
        });
      });
      gsap.utils.toArray<HTMLElement>(`.${styles.frame}`).forEach((frame, index) => {
        gsap.fromTo(frame, { scale: index % 3 === 0 ? .72 : 1.18, opacity: 0 }, {
          scale: index % 2 === 0 ? 1.2 : .82,
          opacity: 1,
          duration: .34,
          delay: (index % 6) * .025,
          ease: 'power2.out',
          yoyo: true,
          repeat: 4,
          repeatDelay: 0,
        });
      });
    }, rootRef);

    const skipTimer = window.setTimeout(() => setCanSkip(true), 650);
    return () => {
      context.revert();
      window.clearTimeout(skipTimer);
      document.body.style.overflow = previousOverflow;
      exitRef.current = null;
    };
  }, [visible]);

  if (!visible) return null;
  return (
    <div ref={rootRef} className={styles.preloader} aria-label="Preparing Quick Fashion">
      <div className={styles.rows} aria-hidden="true">
        {rows.map((row, rowIndex) => (
          <div className={styles.row} key={rowIndex}>
            <div className={styles.rowTrack}>
              {[...row, ...row, ...row].map((name, imageIndex) => (
                <figure className={styles.frame} key={`${name}-${imageIndex}`}>
                  <img className={styles.image} src={`/preloader/${name}`} alt="" draggable={false} />
                </figure>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.grain} />
      <p className={`${styles.topline} qf-preloader-topline`}>Quick Fashion · Moving Index</p>
      <div className={`${styles.counterWrap} qf-preloader-counter-wrap`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
        <span ref={counterRef} className={styles.counter}>00</span><span className={styles.percent}>%</span>
      </div>
      <div ref={washRef} className={styles.wash} />
      <div ref={wordmarkRef} className={styles.wordmark}>Quick Fashion</div>
      {canSkip && <button className={`${styles.skip} qf-preloader-skip`} type="button" onClick={() => exitRef.current?.()}>Skip intro</button>}
    </div>
  );
}
