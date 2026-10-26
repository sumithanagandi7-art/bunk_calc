import { motion } from 'framer-motion';

const LoadingSpinner = ({ size = 40, className = '', fullScreen = false }) => {
  const spinner = (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      {/* Outer ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        style={{ width: size, height: size }}
        className="absolute"
      >
        <div
          className="w-full h-full rounded-full border-2 border-transparent"
          style={{
            borderTopColor: '#6C63FF',
            borderRightColor: '#00D2FF',
          }}
        />
      </motion.div>

      {/* Inner ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        style={{ width: size * 0.6, height: size * 0.6 }}
        className="absolute"
      >
        <div
          className="w-full h-full rounded-full border-2 border-transparent"
          style={{ borderTopColor: '#877BF9', borderLeftColor: '#19E1FF' }}
        />
      </motion.div>

      {/* Center dot */}
      <motion.div
        animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        className="w-1.5 h-1.5 rounded-full bg-primary"
      />
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark/80 backdrop-blur-sm">
        {spinner}
      </div>
    );
  }
  return spinner;
};

export default LoadingSpinner;
