import { useState, useRef, useEffect } from 'react';
import { api } from '../api';

export default function AiChat() {
  const [open, setOpen] = useState(false), [msgs, setMsgs] = useState([]), [text, setText] = useState(''), [busy, setBusy] = useState(false), end = useRef();
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, open]);
  const send = async (e) => {
    e.preventDefault(); if (!text.trim() || busy) return;
    const next = [...msgs, { role: 'user', content: text }]; setMsgs(next); setText(''); setBusy(true);
    try { const d = await api('/ai/chat', { method: 'POST', body: { messages: next.map(({ role, content }) => ({ role, content })) } }); setMsgs([...next, { role: 'assistant', content: d.answer, ai: true }]); }
    catch (x) { setMsgs([...next, { role: 'assistant', content: x.message, error: true }]); }
    setBusy(false);
  };
  return <>
    <button className="chatbtn" onClick={() => setOpen(!open)}>{open ? 'Close' : '✨ Ask AI'}</button>
    {open && <div className="chat"><div className="msgs">
      {!msgs.length && <p className="muted">Ask about attendance, leave, headcount, payroll or company policy. I only see what your role allows. Roman Urdu works too.</p>}
      {msgs.map((m, i) => <div key={i} className={'bubble ' + m.role}>{m.content}{m.ai && <small>AI-generated</small>}</div>)}
      {busy && <div className="bubble assistant">Thinking…</div>}<div ref={end} /></div>
      <form onSubmit={send}><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question…" /><button disabled={busy}>Send</button></form></div>}
  </>;
}
