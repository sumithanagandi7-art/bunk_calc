import { create } from 'zustand';

const getSavedWorkspace = () => {
  try {
    const raw = localStorage.getItem('workspace');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

export const useAuthStore = create((set, get) => ({
  accessToken: localStorage.getItem('accessToken') || null,
  workspace: getSavedWorkspace(),

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
