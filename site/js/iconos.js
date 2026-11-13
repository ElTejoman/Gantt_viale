const svg = (cuerpo, clase = 'ico') =>
  `<svg class="${clase}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${cuerpo}</svg>`;

export const iconos = {
  pendiente: svg('<circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/>'),
  en_curso: svg(
    '<circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor"/>',
  ),
  bloqueada: svg(
    '<circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 8h5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  ),
  terminada: svg(
    '<circle cx="8" cy="8" r="6" fill="currentColor"/><path d="M5.3 8.2l1.8 1.8 3.6-3.8" fill="none" stroke="var(--on-status)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  atrasada: svg(
    '<path d="M8 2.2l6.2 11H1.8z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M8 6.4v3" stroke="var(--on-status)" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.3" r=".85" fill="var(--on-status)"/>',
  ),
  reloj: svg(
    '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  ),
  chevron: svg('<path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 'ico chevron'),
  cerrar: svg('<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
  sol: svg(
    '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  ),
  luna: svg('<path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  salir: svg(
    '<rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  ),
  buscar: svg('<circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.2 10.2l3.3 3.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'),
  check: svg('<path d="M3.5 8.4l2.9 2.9 6.1-6.6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
  enlace: svg('<path d="M6 3.5H3.5v9h9V10M9 3.5h3.5V7M12.5 3.5L7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
  vacio: svg('<rect x="3" y="3" width="10" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/>'),
};
