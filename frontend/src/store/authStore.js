import { create } from 'zustand';

export const useAuthStore = create((set, get) => ({
  accessToken: localStorage.getItem('accessToken') || null,
  workspace: JSON.parse(localStorage.getItem('workspace')) || null,

  login: (token, workspaceData) => {
    localStorage.setItem('accessToken', token);
    localStorage.setItem('workspace', JSON.stringify(workspaceData));
    set({ accessToken: token, workspace: workspaceData });
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('workspace');
    set({ accessToken: null, workspace: null });
  },

  isAuthenticated: () => {
    return !!get().accessToken;
  }
}));
