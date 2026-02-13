// src/api/authApi.ts
import { http } from "./http";

export type UserRole = "admin" | "surveillant" | "formateur";

export type MeResponse = {
  ok: boolean;
  user: {
    id: string;
    name?: string;
    role: UserRole;
    modules?: string[];
  };
};

export async function getMe() {
  return await http<MeResponse>("/api/auth/me");
}

export type LoginResponse = {
  ok: boolean;
  token: string;
  user: MeResponse["user"];
};

export async function login(username: string, password: string) {
  return await http<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export type ChangePasswordResponse = { ok: boolean };

export async function changePassword(oldPassword: string, newPassword: string, confirmPassword: string) {
  return await http<ChangePasswordResponse>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
  });
}
