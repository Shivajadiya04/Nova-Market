import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Chat with the AI Buddy service over Socket.IO. The service authenticates with the same
// httpOnly cookie as the REST APIs. It needs a real Gemini API key and has no mock mode.
export default function AssistantPage() {
    const socketRef = useRef(null);
    const listRef = useRef(null);
    const [ status, setStatus ] = useState('connecting'); // connecting | online | offline
    const [ messages, setMessages ] = useState([]);
    const [ draft, setDraft ] = useState('');
    const [ waiting, setWaiting ] = useState(false);

    useEffect(() => {
        const socket = io({ path: '/api/socket/socket.io/', withCredentials: true, reconnectionAttempts: 3 });
        socketRef.current = socket;

        socket.on('connect', () => setStatus('online'));
        socket.on('connect_error', () => setStatus('offline'));
        socket.on('disconnect', () => setStatus('offline'));
        socket.on('message', (content) => {
            setWaiting(false);
            setMessages(prev => [ ...prev, { role: 'assistant', content: String(content) } ]);
        });

        return () => socket.disconnect();
    }, []);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }, [ messages, waiting ]);

    const send = (event) => {
        event.preventDefault();
        const text = draft.trim();
        if (!text || status !== 'online') return;
        setMessages(prev => [ ...prev, { role: 'user', content: text } ]);
        setDraft('');
        setWaiting(true);
        socketRef.current.emit('message', text);
    };

    return (
        <section className="assistant">
            <div className="page-header page-header--row">
                <div>
                    <h1>Shopping assistant</h1>
                    <p className="muted">Ask it to find products or add them to your cart.</p>
                </div>
                <span className={`badge badge--${status === 'online' ? 'confirmed' : status === 'offline' ? 'cancelled' : 'pending'}`}>{status}</span>
            </div>

            {status === 'offline' && (
                <div className="alert alert--warning" role="status">
                    The assistant is unavailable. It needs the ai-buddy service running with a GOOGLE_API_KEY (see README).
                </div>
            )}

            <div className="chat card">
                <ol className="chat__messages" ref={listRef} aria-live="polite">
                    {messages.length === 0 && <li className="muted">Try: “Find me running shoes under ₹4000”.</li>}
                    {messages.map((message, index) => (
                        <li key={index} className={`chat__message chat__message--${message.role}`}>{message.content}</li>
                    ))}
                    {waiting && <li className="chat__message chat__message--assistant muted">Thinking…</li>}
                </ol>
                <form className="chat__form" onSubmit={send}>
                    <label htmlFor="chat-input" className="sr-only">Message</label>
                    <input id="chat-input" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Type a message…" disabled={status !== 'online'} autoComplete="off" />
                    <button type="submit" className="btn btn--primary" disabled={status !== 'online' || !draft.trim()}>Send</button>
                </form>
            </div>
        </section>
    );
}
