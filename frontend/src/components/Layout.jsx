import React from 'react';
import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import CommandPalette from './CommandPalette';
import { Toaster } from 'react-hot-toast';

export default function Layout() {
  return (
    <div
      className="flex flex-col h-screen font-sans overflow-hidden relative transition-colors duration-300"
      style={{ background: 'var(--surface-canvas)' }}
    >
      {/* Command Palette global (Ctrl+K) */}
      <CommandPalette />

      {/* Barra de navegacion superior */}
      <TopBar />

      {/* Area de contenido principal - 100% del ancho */}
      <main
        className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
        style={{ background: 'var(--surface-canvas)' }}
      >
        <Outlet />
      </main>

      {/* Notificaciones toast */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, sans-serif',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: '600',
          },
        }}
      />
    </div>
  );
}
