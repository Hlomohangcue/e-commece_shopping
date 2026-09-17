import type { Metadata } from 'next';
import './globals.css';
import NavBar from '../components/NavBar';

export const metadata: Metadata = {
  title: 'E-Commerce Website',
  description: 'Browse products and manage your shopping cart.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
