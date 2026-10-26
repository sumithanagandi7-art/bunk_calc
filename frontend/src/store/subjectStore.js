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
      let list = [];
      if (Array.isArray(data?.subjects)) list = data.subjects;
      else if (Array.isArray(data?.data)) list = data.data;
      else if (Array.isArray(data)) list = data;
      set({ subjects: list, loading: false });
      return list;
    } catch (err) {
      console.warn('Could not fetch subjects:', err.message);
      set({ subjects: get().subjects || [], error: err.message, loading: false });
      return get().subjects || [];
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
