export function LineButton({ href, floating = false }: { href: string; floating?: boolean }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`line-btn${floating ? " floating" : ""}`}
      aria-label="私訊官方LINE"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
        <path d="M12 2.5c-5.3 0-9.5 3.4-9.5 7.7 0 3.8 3.4 7 8 7.6.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.6s5.8-3.4 7.9-5.8c1.4-1.6 2-3.2 2-4.6 0-4.3-4.2-7.7-9.5-7.7zM8.1 12.6H6.2c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3h1.4c.3 0 .5.2.5.5s-.2.5-.5.5zm2 0c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.5c0 .3-.2.5-.5.5zm4.7 0c-.2 0-.4-.1-.4-.3l-1.5-2.1v1.9c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.6c0-.2.1-.4.3-.5h.2c.2 0 .3.1.4.2l1.5 2.1V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.5c0 .2-.1.4-.3.5h-.2zm3.1-2.2c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.8h1.4c.3 0 .5.2.5.5s-.2.5-.5.5h-1.9c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5h1.9c.3 0 .5.2.5.5s-.2.5-.5.5h-1.4v.8h1.4z" />
      </svg>
      <span>私訊官方LINE</span>
    </a>
  );
}
