import { useCallback, useEffect, useRef, useState } from 'react'
import api, { parseError } from './api'

/** GET helper with loading/error state; refetches when `deps` change. */
export function useFetch(url, params, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!url) return
    const mine = ++seq.current
    setLoading(true); setError('')
    try {
      const r = await api.get(url, { params })
      if (mine === seq.current) setData(r.data)
    } catch (e) {
      if (mine === seq.current) setError(parseError(e).message)
    } finally {
      if (mine === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, JSON.stringify(params), ...deps])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load, setData }
}

export function useCategories(type) {
  const { data } = useFetch('/api/categories', type ? { type } : undefined)
  return data || []
}
