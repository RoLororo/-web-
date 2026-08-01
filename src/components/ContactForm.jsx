// ============================================================================
// ContactForm — /api/contact に送るフォーム
//
// 外部サービスに頼らず、その日から動く問い合わせ窓口にする。
// 返信先の入力は**任意**。何も書かなければ何も保存されない。
// 送信できなかった時は成功と言わない（届いていないのに届いたと表示するのが
// 一番まずい。運営者に連絡できたつもりで放置されてしまう）。
// ============================================================================

import { useState } from 'react';

const KINDS = ['データの誤り', '削除依頼', 'テーマの提案', '不具合', 'その他'];
const MIN = 10;
const MAX = 2000;

const FAILURE_TEXT = {
  'too-short': `本文が短すぎます（${MIN} 文字以上でお願いします）。`,
  'too-many': '短い時間に何度も送信されました。10 分ほどおいてからお試しください。',
  'bad-origin': '送信元を確認できませんでした。ページを再読み込みしてお試しください。',
  'store-not-configured': '受け付けの準備が整っていません。時間をおいてお試しください。',
  'store-unavailable': '保存先に接続できませんでした。時間をおいてお試しください。',
  network: '通信に失敗しました。接続を確認してお試しください。',
};

export default function ContactForm() {
  const [kind, setKind] = useState(KINDS[0]);
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [state, setState] = useState({ status: 'idle' }); // idle | sending | done | error

  const tooShort = message.trim().length > 0 && message.trim().length < MIN;
  const canSend = message.trim().length >= MIN && state.status !== 'sending';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    setState({ status: 'sending' });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ kind, message, replyTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setState({ status: 'done', ticket: data.ticket });
        setMessage('');
        setReplyTo('');
      } else {
        setState({ status: 'error', reason: data.reason || `http-${res.status}` });
      }
    } catch {
      setState({ status: 'error', reason: 'network' });
    }
  }

  if (state.status === 'done') {
    return (
      <div className="notice contact-done" role="status">
        <strong>送信しました。</strong>
        <span>
          受付番号は <code>{state.ticket}</code> です。
          運営者が直接読んでいます。個人で運営しているため、返信までに数日いただくことがあります。
        </span>
        <span>
          返信先を書いていない場合、こちらから連絡する手段はありません。
          返答が必要な内容であれば、もう一度返信先を添えてお送りください。
        </span>
        <button type="button" className="btn" onClick={() => setState({ status: 'idle' })}>
          続けて送る
        </button>
      </div>
    );
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="contact-kind">ご用件</label>
        <select
          id="contact-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="contact-message">
          内容 <span className="field-req">必須</span>
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
          rows={7}
          placeholder={'例）「システム障害・可用性への関心」の根拠記事に、テーマと関係のない記事が混ざっています。'}
          aria-describedby="contact-message-help"
        />
        <div className="field-help" id="contact-message-help">
          {tooShort
            ? <span className="field-error">{MIN} 文字以上でお願いします（現在 {message.trim().length} 文字）</span>
            : <span>{message.length} / {MAX} 文字</span>}
        </div>
      </div>

      <div className="field">
        <label htmlFor="contact-reply">
          返信先 <span className="field-opt">任意</span>
        </label>
        <input
          id="contact-reply"
          type="text"
          value={replyTo}
          onChange={(e) => setReplyTo(e.target.value.slice(0, 120))}
          placeholder="メールアドレス、X のアカウントなど"
          autoComplete="off"
          aria-describedby="contact-reply-help"
        />
        <div className="field-help" id="contact-reply-help">
          <strong>書かなくても送信できます。</strong>
          書かない場合、こちらから連絡する手段はありません。
          入力された内容は 180 日後に自動で削除されます。
        </div>
      </div>

      {state.status === 'error' && (
        <div className="notice notice-warn" role="alert">
          <strong>送信できませんでした。</strong>
          <span>{FAILURE_TEXT[state.reason] || '不明な理由で失敗しました。時間をおいてお試しください。'}</span>
          <span>入力内容は消えていません。そのまま再送信できます。</span>
        </div>
      )}

      <button type="submit" className="btn primary" disabled={!canSend}>
        {state.status === 'sending' ? '送信中…' : '送信する'}
      </button>
    </form>
  );
}
