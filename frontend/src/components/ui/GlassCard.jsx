import { motion } from 'framer-motion';

const GlassCard = ({ children, className = '', onClick, hoverable = true, ...props }) => {
  return (
    <motion.div
      whileHover={hoverable ? { scale: 1.02, y: -4 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      className={`
        bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl
        shadow-glass hover:shadow-glass-hover hover:border-white/20
        transition-shadow duration-300
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export default GlassCard;
