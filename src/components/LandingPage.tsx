import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion, useScroll, useMotionValueEvent } from 'motion/react';
import { CameraIcon, CheckIcon, LinkIcon, MicIcon, RecordIcon, SparkIcon } from './icons';

const FEATURES = [
  {
    icon: CameraIcon,
    title: 'Screen and face, together',
    body: "See yourself and your screen live while you record. Drag your camera bubble anywhere, resize it with a double-click, and it's baked right into the video.",
  },
  {
    icon: SparkIcon,
    title: 'Trim without the wait',
    body: 'Cut the dead air, mark sections to remove, export a clean MP4, all processed on your machine, in your browser. Nothing uploads until you say so.',
  },
  {
    icon: LinkIcon,
    title: 'One link, done',
    body: "Export, hit share, get a link. Anyone can watch it instantly. No account, no app, no waiting on someone else's software.",
  },
  {
    icon: MicIcon,
    title: 'Built for how you talk',
    body: "A 3-2-1 countdown so you're never caught off guard, live preview the whole time, and a mic that just works. No plugins, no setup.",
  },
];

function springOpts(reduced: boolean) {
  return reduced ? { duration: 0 } : { type: 'spring' as const, damping: 1, duration: 0.4 };
}

function HeroIcon() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const rotateX = useSpring(rawX, { damping: 20, stiffness: 220 });
  const rotateY = useSpring(rawY, { damping: 20, stiffness: 220 });

  const handleMove = (e: React.PointerEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rawY.set(px * 18);
    rawX.set(py * -18);
  };

  const handleLeave = () => {
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <div className="hero-icon-stage" style={{ perspective: 900 }}>
      <motion.div
        ref={ref}
        className="hero-icon-card"
        style={{ rotateX, rotateY }}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        initial={{ opacity: 0, y: 16, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={springOpts(!!reduced)}
      >
        <div className="hero-icon-glow" />
        <img src="/speak-icon.png" alt="speak. app icon" className="hero-icon-img" />
        <div className="hero-icon-sheen" />
      </motion.div>
    </div>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ ...springOpts(!!reduced), delay: reduced ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
}

export function LandingPage() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 8));

  useEffect(() => {
    document.title = 'speak. Record. Share. Be Heard.';
  }, []);

  return (
    <div className="land">
      <nav className={`land-nav ${scrolled ? 'land-nav-scrolled' : ''}`}>
        <div className="land-nav-inner">
          <div className="land-nav-brand">
            <img src="/speak-icon.png" alt="" />
            <span>speak.</span>
          </div>
          <a className="btn btn-secondary btn-small" href="/app">
            Sign in
          </a>
        </div>
      </nav>

      <header className="land-hero">
        <HeroIcon />
        <motion.h1
          className="land-headline"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 1, duration: 0.5, delay: 0.05 }}
        >
          Ideas sound better
          <br />
          <span className="land-headline-accent">on screen.</span>
        </motion.h1>
        <motion.p
          className="land-subtitle"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 1, duration: 0.5, delay: 0.12 }}
        >
          Record your screen, trim out the boring parts, and share a link, entirely in your browser.
          No install, no waiting on uploads.
        </motion.p>
        <motion.div
          className="land-hero-cta"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 1, duration: 0.5, delay: 0.18 }}
        >
          <a className="btn btn-primary btn-large land-cta-btn" href="/app">
            <RecordIcon size={15} />
            Start recording
          </a>
          <span className="land-hero-hint">Free · No credit card</span>
        </motion.div>
      </header>

      <section className="land-features">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.06}>
            <div className="land-feature-card">
              <span className="land-feature-icon">
                <f.icon size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      <section className="land-band">
        <Reveal>
          <div className="land-band-card">
            <p className="land-band-text">
              Ideas sound better <span className="land-headline-accent">on screen.</span>
            </p>
            <div className="land-band-check">
              <CheckIcon size={16} />
              <span>Recording, trimming, and export run on your machine, nothing leaves it until you share.</span>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="land-final">
        <Reveal>
          <h2>Just hit record and speak.</h2>
          <a className="btn btn-primary btn-large land-cta-btn" href="/app">
            <RecordIcon size={15} />
            Get started
          </a>
        </Reveal>
      </section>

      <footer className="land-footer">
        <span>speak.</span>
        <span>Record. Share. Be Heard.</span>
      </footer>
    </div>
  );
}
