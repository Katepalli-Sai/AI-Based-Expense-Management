import { useEffect, useRef, useState } from 'react'
import { Bot, MessageSquarePlus, Send, Trash2, User } from 'lucide-react'
import api, { parseError } from '../api'
import { useFetch } from '../hooks'
import { ErrorBanner, Notice, PageHeader, Spinner, useToast } from '../components/ui'
import { cx } from '../utils'

const SUGGESTIONS = [
  'How much did I spend this month?', 'Which category accounts for most of my expenses?', "Compare this month's spending with last month.",
  'Am I approaching a budget limit?', 'How much have I contributed toward my savings goals?', 'Where might I reduce spending?',
]

export default function AIChat() {
  const toast = useToast()
  const status = useFetch('/api/ai/status')
  const convs = useFetch('/api/ai/conversations')
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const open = async (id) => {
    setActiveId(id); setError(''); setLoadingMsgs(true)
    try { const r = await api.get(`/api/ai/conversations/${id}/messages`); setMessages(r.data.items) }
    catch (e) { setError(parseError(e).message) } finally { setLoadingMsgs(false) }
  }
  const fresh = () => { setActiveId(null); setMessages([]); setError('') }

  const send = async (msg) => {
    const content = (msg ?? text).trim()
    if (!content || sending) return
    setText(''); setError(''); setSending(true)
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content }])
    try {
      const r = await api.post('/api/ai/chat', { message: content, conversation_id: activeId })
      setMessages((m) => [...m.filter((x) => !String(x.id).startsWith('tmp-')), r.data.user_message, r.data.assistant_message])
      if (!activeId) setActiveId(r.data.conversation.id)
      convs.reload()
    } catch (e) {
      setMessages((m) => m.filter((x) => !String(x.id).startsWith('tmp-')))
      setText(content)
      setError(parseError(e).message)
    } finally { setSending(false) }
  }

  const remove = async (id) => {
    try { await api.delete(`/api/ai/conversations/${id}`); if (id === activeId) fresh(); convs.reload(); toast('Conversation deleted') }
    catch (e) { toast(parseError(e).message, 'error') }
  }

  const configured = status.data?.configured
  return (
    <>
      <PageHeader title="AI Financial Chat" subtitle="Ask questions about your own income, spending, budgets and goals. Read-only." />
      {status.data && !configured && <Notice tone="warn">AI chat isn’t configured on this server yet. Ask the administrator to set GEMINI_API_KEY and GEMINI_MODEL in the backend .env file.</Notice>}
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="card p-3 lg:h-[calc(100vh-14rem)] lg:overflow-y-auto">
          <button className="btn-secondary mb-3 w-full" onClick={fresh}><MessageSquarePlus className="h-4 w-4" />New conversation</button>
          {convs.data?.items.length ? (
            <ul className="space-y-1">{convs.data.items.map((c) => (
              <li key={c.id} className={cx('group flex items-center rounded-lg', c.id === activeId ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                <button className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm" onClick={() => open(c.id)}>{c.title}</button>
                <button className="mr-1 rounded p-1 text-slate-400 hover:text-red-600" aria-label={`Delete conversation ${c.title}`} onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></button>
              </li>))}</ul>
          ) : <p className="px-2 text-sm text-slate-500">Previous conversations will appear here.</p>}
        </aside>

        <section className="card flex h-[calc(100vh-14rem)] min-h-[420px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
            {loadingMsgs ? <div className="flex justify-center py-10"><Spinner /></div> : messages.length === 0 ? (
              <div className="mx-auto max-w-xl py-8 text-center">
                <div className="mx-auto mb-3 w-fit rounded-full bg-brand-50 p-3 text-brand-600"><Bot className="h-6 w-6" /></div>
                <h2 className="font-semibold text-navy-900">What would you like to know?</h2>
                <p className="mt-1 text-sm text-slate-500">Answers use your real records. Exact facts are kept separate from suggestions.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => <button key={s} disabled={!configured} onClick={() => send(s)} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">{s}</button>)}
                </div>
              </div>
            ) : messages.map((m) => (
              <div key={m.id} className={cx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
                <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-navy-700 text-white' : 'bg-brand-50 text-brand-600')}>{m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</span>
                <div className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm', m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800')}>{m.content}</div>
              </div>
            ))}
            {sending && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-4 w-4" />Thinking…</div>}
            <div ref={endRef} />
          </div>
          <div className="border-t border-slate-200 p-3">
            <ErrorBanner message={error} />
            <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex gap-2">
              <input aria-label="Message" className="input" maxLength={2000} placeholder={configured ? 'Ask about your finances…' : 'AI chat is not configured'} value={text} onChange={(e) => setText(e.target.value)} disabled={!configured || sending} />
              <button className="btn-primary" disabled={!configured || sending || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
            </form>
            <p className="mt-2 text-xs text-slate-500">AI-generated suggestions are for information only and are not financial advice. This chat can’t change your records.</p>
          </div>
        </section>
      </div>
    </>
  )
}
