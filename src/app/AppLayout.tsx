import { Outlet } from "react-router-dom";
import AppSidebar from "@/components/AppSideBar";

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout() {
  return (
    <TooltipProvider>
      {/* Permet l'affichage des toasts (shadcn + sonner) partout */}
      <Toaster />
      <Sonner />

      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto flex max-w-[1400px] gap-4 p-4">
          <div className="print:hidden">
            <AppSidebar />
          </div>
          
          <div className="flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
