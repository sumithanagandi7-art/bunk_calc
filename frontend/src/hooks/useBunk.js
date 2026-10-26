import { useState, useCallback, useEffect } from 'react';
import api from '../lib/api.js';
import toast from 'react-hot-toast';

const useBunk = () => {
  const [bunkData, setBunkData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const fetchBunkData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/bunk');
      setBunkData(data.bunk_data || data.data || data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load bunk data';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBunkData(); }, [fetchBunkData]);

  return { bunkData, loading, error, refetch: fetchBunkData };
};

export default useBunk;
