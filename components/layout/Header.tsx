"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, Bell, User, Menu, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function TopNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-background/95 backdrop-blur px-6 transition-colors duration-300">
      
      {/* Logo & Desktop Navigation */}
      <div className="flex items-center gap-8">
        <Link href="/admin" className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-foreground">EduCoach</span>
        </Link>
        
        {/* Desktop Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/admin/batches" className="text-muted-foreground hover:text-primary transition-colors">Batches</Link>
          <Link href="/admin/quizzes" className="text-muted-foreground hover:text-primary transition-colors">Quizzes</Link>
          <Link href="/admin/students" className="text-muted-foreground hover:text-primary transition-colors">Students</Link>
          <Link href="/admin/settings" className="text-muted-foreground hover:text-primary transition-colors">Settings</Link>
        </nav>
      </div>
      
      {/* Right Actions & Mobile Menu Toggle */}
      <div className="flex items-center gap-4">
        <button aria-label="View notifications" className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <Bell className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        </button>
        
        <ThemeToggle />
        
        <div className="hidden sm:flex h-8 w-8 rounded-full bg-primary/10 items-center justify-center border border-primary/20 cursor-pointer hover:bg-primary/20 transition-colors">
          <User className="h-4 w-4 text-primary" />
        </div>

        {/* Mobile Hamburger Button */}
        <button 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Toggle mobile menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-16 left-0 right-0 bg-background border-b border-gray-200 dark:border-gray-800 p-6 shadow-lg md:hidden flex flex-col gap-4 animate-in slide-in-from-top-2">
          <Link 
            href="/admin/batches" 
            onClick={() => setMobileMenuOpen(false)}
            className="text-muted-foreground font-medium hover:text-primary transition-colors py-1"
          >
            Batches
          </Link>
          <Link 
            href="/admin/quizzes" 
            onClick={() => setMobileMenuOpen(false)}
            className="text-muted-foreground font-medium hover:text-primary transition-colors py-1"
          >
            Quizzes
          </Link>
          <Link 
            href="/admin/students" 
            onClick={() => setMobileMenuOpen(false)}
            className="text-muted-foreground font-medium hover:text-primary transition-colors py-1"
          >
            Students
          </Link>
          <Link 
            href="/admin/settings" 
            onClick={() => setMobileMenuOpen(false)}
            className="text-muted-foreground font-medium hover:text-primary transition-colors py-1"
          >
            Settings
          </Link>
        </div>
      )}

    </header>
  );
}