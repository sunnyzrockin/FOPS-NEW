import './globals.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider } from '@/lib/auth-context';
import { Toaster } from '@/components/ui/sonner';

export const metadata = {
  title: 'FOPS - Field Operations System',
  description: 'Manage sites, staff, and daily performance in one place',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{__html: `
          .leaflet-container { height: 100%; width: 100%; }
          .fuel-marker { border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; }
          .fuel-marker.own { background: #10b981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.5); }
          .fuel-marker.competitor { background: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
          .fuel-marker.lowest { background: #22c55e; animation: pulse 2s infinite; }
          @keyframes pulse { 0%, 100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.5); } 50% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.8); } }
        `}} />
      </head>
      <body className="bg-background text-foreground min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
