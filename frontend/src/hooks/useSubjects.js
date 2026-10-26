import { useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../lib/api.js';
import useSubjectStore from '../store/subjectStore.js';

const useSubjects = () => {
  const { subjects, loading, error, fetchSubjects } = useSubjectStore();

  useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const addSubjectAPI = useCallback(async (payload) => {
    try {
      const { data } = await api.post('/subjects', payload);
      await fetchSubjects();
      toast.success('Subject added!');
      return data.subject || data.data || data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add subject');
      throw err;
    }
  }, [fetchSubjects]);

  const deleteSubjectAPI = useCallback(async (id) => {
    try {
      await api.delete(`/subjects/${id}`);
      await fetchSubjects();
      toast.success('Subject removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove subject');
      throw err;
    }
  }, [fetchSubjects]);

  const updateSubjectAPI = useCallback(async (id, payload) => {
    try {
      const { data } = await api.put(`/subjects/${id}`, payload);
      await fetchSubjects();
      toast.success('Subject updated!');
      return data.subject || data.data || data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update subject');
      throw err;
    }
  }, [fetchSubjects]);

  return {
    subjects,
    loading,
    error,
    refetch: fetchSubjects,
    addSubject: addSubjectAPI,
    deleteSubject: deleteSubjectAPI,
    updateSubject: updateSubjectAPI,
  };
};

export default useSubjects;
