'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase-browser';

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_full_name: string | null;
  content: string;
  created_at: string;
  read_at: string | null;
};

type Props = {
  rideId: string;
  myUserId: string;
  otherName: string;
  onClose: () => void;
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function RideChat({ rideId, myUserId, otherName, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabaseBrowser.rpc('ride_messages_history', { p_ride_id: rideId });
      if (!mounted) return;
      setMessages((data ?? []) as ChatMessage[]);
      scrollToBottom();
      supabaseBrowser.rpc('mark_ride_messages_read', { p_ride_id: rideId });
    })();

    const channel = supabaseBrowser
      .channel(`ride_messages:${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ride_messages', filter: `ride_id=eq.${rideId}` },
        async (payload) => {
          const raw = payload.new as { id: string; sender_id: string; content: string; created_at: string };
          // Fetch nom sender depuis la RPC (une seule ligne)
          const { data } = await supabaseBrowser.rpc('ride_messages_history', { p_ride_id: rideId });
          if (Array.isArray(data)) {
            setMessages(data as ChatMessage[]);
            scrollToBottom();
          } else {
            setMessages((prev) => [...prev, {
              ...raw,
              sender_full_name: null,
              read_at: null,
            }]);
            scrollToBottom();
          }
          if (raw.sender_id !== myUserId) {
            supabaseBrowser.rpc('mark_ride_messages_read', { p_ride_id: rideId });
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabaseBrowser.removeChannel(channel);
    };
  }, [rideId, myUserId, scrollToBottom]);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    const { error: rpcErr } = await supabaseBrowser.rpc('send_ride_message', {
      p_ride_id: rideId,
      p_content: content,
    });
    setSending(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setInput('');
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex items-center gap-md border-b border-neutral-200 bg-white px-lg py-md shadow-sm">
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 text-neutral-900"
          aria-label="Fermer"
        >
          <span className="text-lg leading-none">←</span>
        </button>
        <div className="flex-1">
          <p className="text-sm font-bold text-neutral-900">{otherName}</p>
          <p className="text-[10px] text-neutral-500">Chat de la course</p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-neutral-50 p-md">
        {messages.length === 0 ? (
          <p className="mt-2xl text-center text-xs text-neutral-500">
            Aucun message. Écris le premier ci-dessous.
          </p>
        ) : (
          <ul className="space-y-sm">
            {messages.map((m) => {
              const mine = m.sender_id === myUserId;
              return (
                <li
                  key={m.id}
                  className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-md py-sm shadow-sm ${
                      mine
                        ? 'rounded-br-sm bg-primary-500 text-white'
                        : 'rounded-bl-sm bg-white text-neutral-900 ring-1 ring-neutral-200'
                    }`}
                  >
                    <p className="text-sm">{m.content}</p>
                    <p className={`mt-xs text-right text-[9px] ${mine ? 'text-white/70' : 'text-neutral-400'}`}>
                      {fmtTime(m.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-white px-lg py-md">
        {error && <p className="mb-xs text-xs text-error">{error}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          className="flex gap-sm"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ton message…"
            maxLength={500}
            className="flex-1 rounded-full border border-neutral-200 bg-white px-md py-sm text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            type="submit"
            disabled={sending || input.trim().length === 0}
            className="rounded-full bg-primary-500 px-lg py-sm text-sm font-bold text-white shadow-sm hover:brightness-110 disabled:opacity-50"
          >
            {sending ? '…' : 'Envoyer'}
          </button>
        </form>
      </div>
    </div>
  );
}
