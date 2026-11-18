import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <header className="relative z-50 w-full bg-transparent border-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
        {/* Brand Name and Karnataka Cricket Ball Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 font-pixel text-lg sm:text-xl md:text-2xl tracking-tight text-white select-none group"
          aria-label="Namma Auction Home"
        >
          <img
            src="/logo.png"
            alt="Namma Auction Logo"
            width="32"
            height="32"
            className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-[0_2px_12px_rgba(237,27,36,0.5)] group-hover:rotate-12 transition-transform duration-300 shrink-0"
          />
          <span className="font-black bg-gradient-to-r from-amber-400 via-yellow-200 to-red-500 bg-clip-text text-transparent">
            Namma Auction
          </span>
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
