import { createBrowserRouter } from "react-router-dom";
import AppLayout from "./AppLayout";

import Index from "@/pages/Index";
import Settings from "@/pages/Settings";
import GenerateTimetable from "@/pages/GenerateTimeTable";
import FreeRooms from "@/pages/FreeRooms";
import Dashboard from "@/pages/Dashboard";
import Exports from "@/pages/Exports";
import VirtualTimetable from "@/pages/VirtualTimetable";
import TeacherOfficialTimetable from "@/pages/TeacherOfficialTimetable";
import PendingRequests from "@/pages/PendingRequests";
import ChangePassword from "@/pages/ChangePassword";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

import RequireRole from "@/auth/RequireRole";


export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    element: <AppLayout />,
    children: [
      {
        path: "/",
        element: (
          <RequireRole roles={["admin", "surveillant"]}>
            <Index />
          </RequireRole>
        ),
      },
      {
        path: "/dashboard",
        element: (
          <RequireRole roles={["admin", "surveillant"]}>
            <Dashboard />
          </RequireRole>
        ),
      },
      {
        path: "/emploi",
        element: (
          <RequireRole roles={["formateur"]}>
            <TeacherOfficialTimetable />
          </RequireRole>
        ),
      },
      {
        path: "/virtuel",
        element: (
          <RequireRole roles={["admin", "formateur"]}>
            <VirtualTimetable />
          </RequireRole>
        ),
      },
      {
        path: "/pending",
        element: (
          <RequireRole roles={["admin", "formateur"]}>
            <PendingRequests />
          </RequireRole>
        ),
      },

      {
        path: "/change-password",
        element: (
          <RequireRole roles={["admin", "surveillant", "formateur"]}>
            <ChangePassword />
          </RequireRole>
        ),
      },
      {
        path: "/sallelibre",
        element: (
          <RequireRole roles={["admin","surveillant"]}>
            <FreeRooms />
          </RequireRole>
        ),
      },
      {
        path: "/exports",
        element: (
          <RequireRole roles={["admin"]}>
            <Exports />
          </RequireRole>
        ),
      },
      {
        path: "/genereremploi",
        element: (
          <RequireRole roles={["admin"]}>
            <GenerateTimetable />
          </RequireRole>
        ),
      },
      {
        path: "/parametres",
        element: (
          <RequireRole roles={["admin"]}>
            <Settings />
          </RequireRole>
        ),
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
