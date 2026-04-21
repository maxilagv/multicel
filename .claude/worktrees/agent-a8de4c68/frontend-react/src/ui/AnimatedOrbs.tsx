import { useReducedMotion } from 'framer-motion';

const particles = [
  { left: '6%', size: 6, delay: 0, duration: 12 },
  { left: '14%', size: 4, delay: 2, duration: 10 },
  { left: '22%', size: 5, delay: 5, duration: 11 },
  { left: '31%', size: 3, delay: 1, duration: 9 },
  { left: '38%', size: 4, delay: 3, duration: 12 },
  { left: '46%', size: 6, delay: 6, duration: 14 },
  { left: '54%', size: 4, delay: 4, duration: 10 },
  { left: '61%', size: 5, delay: 7, duration: 13 },
  { left: '67%', size: 3, delay: 2.5, duration: 9 },
  { left: '72%', size: 6, delay: 8, duration: 14 },
  { left: '78%', size: 4, delay: 1.5, duration: 10 },
  { left: '84%', size: 5, delay: 4.5, duration: 11 },
  { left: '89%', size: 3, delay: 6.5, duration: 9 },
  { left: '94%', size: 4, delay: 9, duration: 12 },
  { left: '97%', size: 3, delay: 7.5, duration: 10 },
];

const stars = [
  { top: '8%', left: '12%', size: 2, delay: 0.5, duration: 3.2 },
  { top: '12%', left: '28%', size: 1, delay: 1.1, duration: 2.6 },
  { top: '18%', left: '44%', size: 2, delay: 0.2, duration: 3.8 },
  { top: '10%', left: '64%', size: 1.5, delay: 0.9, duration: 2.9 },
  { top: '6%', left: '80%', size: 2, delay: 1.4, duration: 3.4 },
  { top: '22%', left: '6%', size: 1.5, delay: 0.6, duration: 2.7 },
  { top: '26%', left: '20%', size: 1, delay: 1.6, duration: 2.4 },
  { top: '30%', left: '36%', size: 2, delay: 0.3, duration: 3.1 },
  { top: '24%', left: '58%', size: 1.5, delay: 1.8, duration: 2.8 },
  { top: '28%', left: '74%', size: 2, delay: 0.7, duration: 3.6 },
  { top: '36%', left: '10%', size: 1, delay: 0.4, duration: 2.5 },
  { top: '40%', left: '26%', size: 2, delay: 1.2, duration: 3.3 },
  { top: '38%', left: '50%', size: 1.5, delay: 0.8, duration: 2.7 },
  { top: '42%', left: '68%', size: 1, delay: 1.9, duration: 2.6 },
  { top: '46%', left: '86%', size: 2, delay: 0.1, duration: 3.9 },
  { top: '54%', left: '16%', size: 1.5, delay: 1.5, duration: 2.8 },
  { top: '58%', left: '34%', size: 1, delay: 0.3, duration: 2.4 },
  { top: '62%', left: '52%', size: 2, delay: 1.7, duration: 3.5 },
  { top: '66%', left: '70%', size: 1.5, delay: 0.6, duration: 2.9 },
  { top: '72%', left: '88%', size: 2, delay: 1.1, duration: 3.2 },
];

export default function AnimatedOrbs() {
  const reduceMotion = useReducedMotion();
  return (
    <div className={`login-ambient${reduceMotion ? ' reduced-motion' : ''}`}>
      <div className="login-orb orb-1" />
      <div className="login-orb orb-2" />
      <div className="login-orb orb-3" />
      <div className="login-orb orb-4" />
      <div className="login-orb orb-5" />

      <div className="login-wave wave-1">
        <div className="login-wave-core" />
      </div>
      <div className="login-wave wave-2">
        <div className="login-wave-core" />
      </div>
      <div className="login-wave wave-3">
        <div className="login-wave-core" />
      </div>

      <div className="login-energy energy-1" />
      <div className="login-energy energy-2" />
      <div className="login-energy energy-3" />

      <div className="login-ring ring-1" />
      <div className="login-ring ring-2" />
      <div className="login-ring ring-3" />

      {particles.map((item, index) => (
        <span
          key={`particle-${index}`}
          className="login-particle"
          style={{
            left: item.left,
            ['--size' as any]: `${item.size}px`,
            ['--delay' as any]: `${item.delay}s`,
            ['--duration' as any]: `${item.duration}s`,
          }}
        />
      ))}

      {stars.map((item, index) => (
        <span
          key={`star-${index}`}
          className="login-star"
          style={{
            top: item.top,
            left: item.left,
            ['--size' as any]: `${item.size}px`,
            ['--delay' as any]: `${item.delay}s`,
            ['--duration' as any]: `${item.duration}s`,
          }}
        />
      ))}
    </div>
  );
}
