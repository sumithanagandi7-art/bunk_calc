import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GraduationCap, ArrowRight, Sparkles, Brain, School, Lock, Camera } from 'lucide-react';

const Landing = () => {
  return (
    <div className="min-h-screen bg-[#F8F9FA] overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[60%] h-full bg-[#EADDFF] rounded-l-[100px] opacity-40 -z-10 transform translate-x-20" />
      
      {/* Navbar */}
      <header className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <GraduationCap size={32} className="text-gray-900" />
          <span className="text-xl font-bold text-gray-900">Bunk Calculator</span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-gray-600">
          <a href="#" className="hover:text-primary transition-colors">Features</a>
          <a href="#" className="hover:text-primary transition-colors">How it Works</a>
          <a href="#" className="hover:text-primary transition-colors">For Colleges</a>
          <a href="#" className="hover:text-primary transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link to="/access" className="btn-secondary px-6 py-2">Enter Code</Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-8 pt-12 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        
        {/* Left Content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-primary font-bold text-sm rounded-full mb-8">
            <Sparkles size={16} /> Skip Smart • Stay Eligible
          </div>

          <h1 className="text-6xl md:text-7xl font-extrabold text-gray-900 leading-[1.1] mb-6">
            Calmly Plan <br />
            <span className="text-primary">Your Bunks</span> 😉
          </h1>

          <p className="text-xl text-gray-600 mb-10 max-w-md">
            Track attendance. Know your limits. Stay stress-free.
          </p>

          {/* Mini Features */}
          <div className="flex flex-wrap gap-8 mb-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-green-100 text-green-600 flex items-center justify-center"><Brain size={20} /></div>
              <span className="text-xs font-bold text-gray-500">Smart Calc</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center"><School size={20} /></div>
              <span className="text-xs font-bold text-gray-500">Multiple Colls</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-yellow-100 text-yellow-600 flex items-center justify-center"><Lock size={20} /></div>
              <span className="text-xs font-bold text-gray-500">Secure</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center"><Camera size={20} /></div>
              <span className="text-xs font-bold text-gray-500">OCR Import</span>
            </div>
          </div>

          <Link to="/access" className="inline-flex items-center gap-2 btn-primary px-8 py-4 text-lg">
            Get Started <ArrowRight size={20} />
          </Link>
        </motion.div>

        {/* Right Illustration Area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative h-[600px] hidden lg:block"
        >
          {/* Playful Stickers */}
          <div className="absolute top-10 right-10 bg-green-200 text-green-900 font-marker text-xl p-4 rounded-xl rotate-3 shadow-sm animate-wiggle">
            Minimum Effort<br/>Maximum Vibes
          </div>
          
          <div className="absolute bottom-20 left-10 text-gray-900 font-marker text-lg -rotate-6">
            Better Bunks<br/>Brighter Futures ↘
          </div>

          <div className="absolute bottom-40 right-0 bg-yellow-100 border-2 border-yellow-300 p-4 rounded-xl rotate-6 shadow-sm font-marker">
            <div className="flex items-center gap-2">CLASSES <span className="text-green-500">✔</span></div>
            <div className="flex items-center gap-2">BUNKS <span className="text-green-500">✔</span></div>
            <div className="flex items-center gap-2">LIFE <span className="text-green-500">✔</span></div>
          </div>

          {/* Abstract Hero Image replacement (since we can't use the exact illustration) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-80 h-80 bg-white rounded-full shadow-soft flex items-center justify-center relative z-10 border-8 border-purple-50">
              <span className="text-9xl animate-float">😎</span>
              
              {/* Fake laptop */}
              <div className="absolute -bottom-10 w-64 h-40 bg-gray-900 rounded-t-2xl shadow-xl flex items-center justify-center transform -rotate-3 text-white font-marker text-sm">
                ATTENDANCE?<br/>CHILL...
              </div>
            </div>
          </div>

        </motion.div>
      </main>
    </div>
  );
};

export default Landing;
