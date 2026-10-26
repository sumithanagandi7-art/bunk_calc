import { motion } from 'framer-motion';

const getColor = (pct) => {
  if (pct >= 75) return { stroke: '#10B981', track: '#D1FAE5', text: 'text-green-700' };
  if (pct >= 60) return { stroke: '#F59E0B', track: '#FEF3C7', text: 'text-yellow-700' };
  return { stroke: '#EF4444', track: '#FEE2E2', text: 'text-red-700' };
};

const AnimatedProgressRing = ({ percentage = 0, size = 80, strokeWidth = 6, className = '' }) => {
  const radius      = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset      = circumference - (percentage / 100) * circumference;
  const { stroke, track, text } = getColor(percentage);
  const cx = size / 2;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={radius} fill="none" stroke={track} strokeWidth={strokeWidth} />
        {/* Progress */}
        <motion.circle
          cx={cx} cy={cx} r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.2 }}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold ${text} leading-none`}>{Math.round(percentage)}%</span>
      </div>
    </div>
  );
};

export default AnimatedProgressRing;
