import { create } from 'zustand';
import api from '../lib/api.js';

const useSubjectStore = create((set, get) => ({
  subjects: [],
  loading: false,
  error: null,

  fetchSubjects: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get('/subjects');
      set({ subjects: data.subjects || data.data || data, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
      throw err;
    }
  },

  addSubject: (subject) => {
    set((state) => ({ subjects: [...state.subjects, subject] }));
  },

  updateSubject: (id, updates) => {
    set((state) => ({
      subjects: state.subjects.map((s) => (s.subject_id === id || s._id === id ? { ...s, ...updates } : s)),
    }));
  },

  removeSubject: (id) => {
    set((state) => ({ subjects: state.subjects.filter((s) => s.subject_id !== id && s._id !== id) }));
  },

  clearSubjects: () => set({ subjects: [], error: null }),
}));

export default useSubjectStore;
