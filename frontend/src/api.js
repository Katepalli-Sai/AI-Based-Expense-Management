import axios from 'axios'

const TOKEN_KEY = 'ie_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '', timeout: 45000 })

api.interceptors.request.use((cfg) => {
  const t = getToken()
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn)

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url || ''
    if (err.response?.status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) onUnauthorized()
    return Promise.reject(err)
  },
)

/** Turns any axios error into { message, fields } for display. */
export function parseError(err) {
  if (err.code === 'ECONNABORTED') return { message: 'The request took too long. Please try again.', fields: {} }
  if (!err.response) return { message: 'Cannot reach the server. Check that the backend is running.', fields: {} }
  const d = err.response.data
  const fields = {}
  if (Array.isArray(d?.errors)) d.errors.forEach((e) => (fields[e.field] = e.message))
  let message = typeof d?.detail === 'string' ? d.detail : 'Something went wrong. Please try again.'
  if (Array.isArray(d?.detail)) message = d.detail.map((x) => x.msg).join('. ')
  return { message, fields, status: err.response.status }
}

export async function downloadFile(url, params, fallbackName) {
  const res = await api.get(url, { params, responseType: 'blob' })
  const cd = res.headers['content-disposition'] || ''
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName
  const href = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
}

export default api
